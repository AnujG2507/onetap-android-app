package app.onetap.shortcuts;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * NativePdfViewerActivity
 * 
 * Minimal native PDF viewer designed for reading, not document management.
 * Uses Android's PdfRenderer for hardware-accelerated rendering.
 * 
 * Features:
 * - Continuous vertical scroll (RecyclerView with pre-render margins)
 * - Canvas-level pinch-to-zoom (Google Drive style, no page overlap)
 * - Double-tap to toggle fit/zoom with smooth animation
 * - Low-res → high-res atomic swap (no blur during zoom)
 * - LRU bitmap cache for smooth scrolling
 * - Resume position (scroll + zoom persisted)
 * - Auto-hiding header with scroll detection
 * - "Open with" external app support
 * 
 * Explicitly excluded (by design):
 * - Search, annotations, thumbnails, reading modes, page overlays
 * 
 * Philosophy: Display content. That's it.
 */
public class NativePdfViewerActivity extends Activity {
    
    private static final String TAG = "NativePdfViewer";
    private static final String PREFS_NAME = "pdf_resume_positions";
    private static final int AUTO_HIDE_DELAY_MS = 4000;
    private static final float MIN_ZOOM = 0.2f;  // Show ~5 pages when zoomed out
    private static final float MAX_ZOOM = 5.0f;
    private static final float DOUBLE_TAP_ZOOM = 2.5f;
    private static final float FIT_PAGE_ZOOM = 1.0f;  // Default fit-to-width
    
    // Pre-render pages above/below viewport for smooth scrolling
    private static final int PRERENDER_PAGES = 2;
    
    // Low-res scale factor for instant preview (0.5x = half resolution)
    private static final float LOW_RES_SCALE = 0.5f;
    
    // Page gap in dp
    private static final int PAGE_GAP_DP = 8;
    
    // Scroll threshold for header show/hide (in pixels)
    private static final int SCROLL_THRESHOLD = 20;
    
    // Core components
    private ZoomableRecyclerView recyclerView;
    private PdfPageAdapter adapter;
    private PdfRenderer pdfRenderer;
    private ParcelFileDescriptor fileDescriptor;
    
    // PDF URI for "Open with" feature
    private Uri pdfUri;
    
    // Cached page dimensions (avoids synchronous PDF access during binding)
    private int[] pageWidths;
    private int[] pageHeights;
    
    // Bitmap cache (LRU, sized for ~10 pages at screen resolution)
    private LruCache<String, Bitmap> bitmapCache;
    
    // Track which pages are being rendered to avoid duplicates
    // THREAD-SAFE: Uses ConcurrentHashMap.newKeySet() to prevent ConcurrentModificationException
    private final Set<String> pendingRenders = ConcurrentHashMap.newKeySet();
    
    // Previous zoom level (for fallback bitmap lookup during transitions)
    private float previousZoom = 1.0f;
    
    // Error state UI (shown instead of RecyclerView when PDF can't be opened)
    private FrameLayout errorView;
    
    // UI chrome
    private FrameLayout topBar;
    private ImageButton closeButton;
    private ImageButton openWithButton;
    private TextView pageIndicator;
    private boolean isTopBarVisible = true;
    
    // Zoom state (now managed by ZoomableRecyclerView for canvas-level zoom)
    private float currentZoom = 1.0f;
    private ScaleGestureDetector scaleGestureDetector;
    private GestureDetector gestureDetector;
    private boolean isScaling = false;
    
    // Double-tap zoom animation
    private static final int DOUBLE_TAP_ANIM_DURATION_MS = 220;
    private ValueAnimator doubleTapAnimator;
    private boolean isDoubleTapAnimating = false;
    
    // Resume state
    private String shortcutId;
    private boolean resumeEnabled = true;
    private int resumePageIndex = 0;
    private int resumePixelOffset = 0;
    private float resumeScrollFraction = 0;
    private float resumeZoom = 1.0f;
    
    // Display metrics
    private int screenWidth;
    private int screenHeight;
    private float density;
    
    // Background rendering (2 threads for low-res + high-res parallel rendering)
    private ExecutorService renderExecutor;
    
    // Main thread handler for UI updates
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    
    // Auto-hide handler
    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private final Runnable hideRunnable = this::hideTopBar;
    
    // Render generation counter (invalidates old renders when zoom changes)
    private final AtomicInteger renderGeneration = new AtomicInteger(0);
    
    // Crash logger instance for this activity
    private final CrashLogger crashLogger = CrashLogger.getInstance();
    
    /**
     * Custom RecyclerView that applies canvas-level zoom transformation.
     * 
     * This approach (used by Google Drive) ensures:
     * - All children scale uniformly without overlapping
     * - RecyclerView layout remains stable during zoom
     * - Horizontal panning works when zoomed in
     * - No per-child scale manipulation needed
     */
    private class ZoomableRecyclerView extends RecyclerView {
        private float zoomLevel = 1.0f;
        private float panX = 0f;
        private float focalX = 0f;
        private float focalY = 0f;
        
        // Zoom state during gesture
        private float pendingZoom = 1.0f;
        private float gestureStartZoom = 1.0f;
        
        public ZoomableRecyclerView(Context context) {
            super(context);
            // Disable overscroll effect during pan
            setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        }
        
        @Override
        protected void dispatchDraw(Canvas canvas) {
            canvas.save();
            
            if (zoomLevel < 1.0f) {
                // ZOOMED OUT: Scale from screen center, no focal point tracking
                // This keeps content centered on screen (Google Drive behavior)
                float centerX = getWidth() / 2f;
                float centerY = getHeight() / 2f;
                canvas.scale(zoomLevel, zoomLevel, centerX, centerY);
            } else if (zoomLevel > 1.0f) {
                // ZOOMED IN: Pan + scale from focal point
                canvas.translate(panX, 0);
                canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
            }
            // At 1.0x: No transformation needed
            
            super.dispatchDraw(canvas);
            canvas.restore();
        }
        
        @Override
        public boolean onInterceptTouchEvent(MotionEvent e) {
            // Always intercept to handle horizontal panning when zoomed
            if (zoomLevel > 1.0f && e.getPointerCount() == 1) {
                return true;
            }
            return super.onInterceptTouchEvent(e);
        }
        
        private float lastTouchX = 0f;
        private boolean isPanning = false;
        
        @Override
        public boolean onTouchEvent(MotionEvent e) {
            // Handle horizontal panning when zoomed in
            if (zoomLevel > 1.0f) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        lastTouchX = e.getX();
                        isPanning = false;
                        break;
                        
                    case MotionEvent.ACTION_MOVE:
                        if (e.getPointerCount() == 1 && !isScaling) {
                            float dx = e.getX() - lastTouchX;
                            if (Math.abs(dx) > 10) {
                                isPanning = true;
                            }
                            if (isPanning) {
                                setPanX(panX + dx);
                                lastTouchX = e.getX();
                            }
                        }
                        break;
                        
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (isPanning) {
                            isPanning = false;
                            return true;
                        }
                        break;
                }
            }
            
            return super.onTouchEvent(e);
        }
        
        /**
         * Set zoom level and focal point, then invalidate for redraw.
         */
        public void setZoom(float zoom, float fx, float fy) {
            this.zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
            this.focalX = fx;
            this.focalY = fy;
            
            // Clamp pan when zoom changes
            clampPan();
            
            invalidate();
        }
        
        /**
         * Set horizontal pan offset with bounds clamping.
         */
        public void setPanX(float x) {
            this.panX = x;
            clampPan();
            invalidate();
        }
        
        /**
         * Clamp pan to content bounds.
         */
        private void clampPan() {
            if (zoomLevel <= 1.0f) {
                panX = 0;
                return;
            }
            
            // Calculate max pan based on zoom
            float contentWidth = getWidth() * zoomLevel;
            float maxPan = contentWidth - getWidth();
            
            // Pan can go from -maxPan to 0 (content slides left to show right edge)
            panX = Math.max(-maxPan, Math.min(0, panX));
        }
        
        /**
         * Get current zoom level.
         */
        public float getZoomLevel() {
            return zoomLevel;
        }
        
        /**
         * Reset to 1.0x zoom with no pan.
         */
        public void resetZoom() {
            this.zoomLevel = 1.0f;
            this.panX = 0f;
            this.focalX = getWidth() / 2f;
            this.focalY = getHeight() / 2f;
            invalidate();
        }
        
        /**
         * Start a zoom gesture (save starting state).
         */
        public void beginZoomGesture(float fx, float fy) {
            this.gestureStartZoom = zoomLevel;
            this.pendingZoom = zoomLevel;
            this.focalX = fx;
            this.focalY = fy;
        }
        
        /**
         * Update zoom during gesture (live preview).
         */
        public void updateZoomGesture(float scaleFactor) {
            pendingZoom = gestureStartZoom * scaleFactor;
            pendingZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pendingZoom));
            setZoom(pendingZoom, focalX, focalY);
        }
        
        /**
         * Commit zoom gesture and trigger re-render.
         */
        public void commitZoomGesture() {
            // Zoom is already applied, just update tracking
            zoomLevel = pendingZoom;
        }
        
        /**
         * Animate zoom from current to target level.
         * For zoom-out, animate focal point toward screen center for smooth transition.
         */
        public void animateZoomTo(float targetZoom, float fx, float fy, Runnable onComplete) {
            if (doubleTapAnimator != null && doubleTapAnimator.isRunning()) {
                doubleTapAnimator.cancel();
            }
            
            final float startZoom = zoomLevel;
            final float startPanX = panX;
            final float startFocalX = focalX;
            final float startFocalY = focalY;
            
            // Target focal point is center when zooming to or below 1.0x
            final float targetFocalX = (targetZoom <= 1.0f) ? getWidth() / 2f : fx;
            final float targetFocalY = (targetZoom <= 1.0f) ? getHeight() / 2f : fy;
            final float targetPanX = (targetZoom <= 1.0f) ? 0 : panX;
            
            doubleTapAnimator = ValueAnimator.ofFloat(0f, 1f);
            doubleTapAnimator.setDuration(DOUBLE_TAP_ANIM_DURATION_MS);
            doubleTapAnimator.setInterpolator(new DecelerateInterpolator(1.5f));
            
            doubleTapAnimator.addUpdateListener(animation -> {
                float progress = (float) animation.getAnimatedValue();
                zoomLevel = startZoom + (targetZoom - startZoom) * progress;
                panX = startPanX + (targetPanX - startPanX) * progress;
                focalX = startFocalX + (targetFocalX - startFocalX) * progress;
                focalY = startFocalY + (targetFocalY - startFocalY) * progress;
                clampPan();
                invalidate();
            });
            
            doubleTapAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(android.animation.Animator animation) {
                    zoomLevel = targetZoom;
                    if (targetZoom <= 1.0f) {
                        panX = 0;
                        focalX = getWidth() / 2f;
                        focalY = getHeight() / 2f;
                    }
                    clampPan();
                    invalidate();
                    if (onComplete != null) {
                        onComplete.run();
                    }
                }
            });
            
            doubleTapAnimator.start();
        }
    }
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Initialize crash logging
        crashLogger.initialize(this);
        crashLogger.addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "PdfViewer.onCreate started");
        
        // KEEP SCREEN AWAKE during reading
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        
        // Get display metrics
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        screenWidth = metrics.widthPixels;
        screenHeight = metrics.heightPixels;
        density = metrics.density;
        
        // Initialize bitmap cache (use 1/8th of available memory)
        int maxMemory = (int) (Runtime.getRuntime().maxMemory() / 1024);
        int cacheSize = maxMemory / 8;
        bitmapCache = new LruCache<String, Bitmap>(cacheSize) {
            @Override
            protected int sizeOf(String key, Bitmap bitmap) {
                return bitmap.getByteCount() / 1024;
            }
            // NOTE: entryRemoved() intentionally NOT overridden
            // Previously we called bitmap.recycle() here, but this caused race conditions
        };
        
        // Extract intent data
        pdfUri = getIntent().getData();
        shortcutId = getIntent().getStringExtra("shortcut_id");
        resumeEnabled = getIntent().getBooleanExtra("resume", true);
        
        // Initialize render executor early
        renderExecutor = Executors.newFixedThreadPool(3);
        
        if (pdfUri == null) {
            crashLogger.recordError("PdfViewer", "onCreate", "No PDF URI provided", 
                "shortcutId", String.valueOf(shortcutId));
            Log.e(TAG, "No PDF URI provided");
            buildUI();
            showCalmErrorState();
            return;
        }
        
        crashLogger.addBreadcrumb(CrashLogger.CAT_IO, "Opening PDF: " + pdfUri);
        crashLogger.setCustomKey("pdf_shortcut_id", shortcutId != null ? shortcutId : "none");
        Log.d(TAG, "Opening PDF: " + pdfUri + ", shortcutId=" + shortcutId + ", resume=" + resumeEnabled);
        
        // Load resume state if enabled
        if (resumeEnabled && shortcutId != null) {
            loadResumeState();
        }
        
        // Setup immersive fullscreen
        setupImmersiveMode();
        
        // Build UI
        buildUI();
        
        // Setup gesture detectors
        setupGestureDetectors();
        
        // Open PDF
        if (!openPdf(pdfUri)) {
            Log.e(TAG, "Failed to open PDF");
            showCalmErrorState();
            return;
        }
        
        // Setup adapter
        setupRecyclerView();
        
        // Restore resume position after layout
        if (resumeEnabled && (resumePageIndex > 0 || resumePixelOffset != 0)) {
            recyclerView.post(() -> restoreResumePosition());
        }
        
        // Apply resume zoom
        if (resumeEnabled && resumeZoom != 1.0f) {
            currentZoom = resumeZoom;
            recyclerView.setZoom(resumeZoom, screenWidth / 2f, screenHeight / 2f);
        }
        
        // Schedule auto-hide
        scheduleHide();
    }
    
    private void setupImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        }
    }
    
    private void buildUI() {
        // Root container
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000); // Pure black background
        root.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        
        // ZoomableRecyclerView for pages (canvas-level zoom)
        recyclerView = new ZoomableRecyclerView(this);
        recyclerView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        recyclerView.setBackgroundColor(0xFF1A1A1A); // Dark gray for page gaps
        recyclerView.setHasFixedSize(false);
        recyclerView.setItemAnimator(null); // Disable animations for smooth scrolling
        recyclerView.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
        
        root.addView(recyclerView);
        
        // Top bar with gradient background
        topBar = new FrameLayout(this);
        int topBarHeight = dpToPx(56);
        FrameLayout.LayoutParams topBarParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, topBarHeight
        );
        topBar.setLayoutParams(topBarParams);
        
        // Gradient background for top bar
        android.graphics.drawable.GradientDrawable gradient = new android.graphics.drawable.GradientDrawable(
            android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0xCC000000, 0x00000000}
        );
        topBar.setBackground(gradient);
        topBar.setPadding(dpToPx(16), dpToPx(8), dpToPx(16), 0);
        
        // Close button (left)
        closeButton = new ImageButton(this);
        closeButton.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        closeButton.setColorFilter(0xFFFFFFFF);
        closeButton.setBackgroundResource(android.R.drawable.dialog_holo_dark_frame);
        int buttonSize = dpToPx(44);
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(buttonSize, buttonSize);
        closeParams.gravity = android.view.Gravity.START | android.view.Gravity.CENTER_VERTICAL;
        closeButton.setLayoutParams(closeParams);
        closeButton.setOnClickListener(v -> exitViewer());
        topBar.addView(closeButton);
        
        // Page indicator (center)
        pageIndicator = new TextView(this);
        pageIndicator.setTextColor(0xAAFFFFFF);
        pageIndicator.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        FrameLayout.LayoutParams indicatorParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        indicatorParams.gravity = android.view.Gravity.CENTER;
        pageIndicator.setLayoutParams(indicatorParams);
        topBar.addView(pageIndicator);
        
        // "Open with" button (right)
        openWithButton = new ImageButton(this);
        openWithButton.setImageResource(android.R.drawable.ic_menu_share);
        openWithButton.setColorFilter(0xFFFFFFFF);
        openWithButton.setBackgroundResource(android.R.drawable.dialog_holo_dark_frame);
        FrameLayout.LayoutParams openWithParams = new FrameLayout.LayoutParams(buttonSize, buttonSize);
        openWithParams.gravity = android.view.Gravity.END | android.view.Gravity.CENTER_VERTICAL;
        openWithButton.setLayoutParams(openWithParams);
        openWithButton.setOnClickListener(v -> openWithExternalApp());
        topBar.addView(openWithButton);
        
        root.addView(topBar);
        
        // Error view (hidden by default)
        errorView = buildCalmErrorView();
        errorView.setVisibility(View.GONE);
        root.addView(errorView);
        
        setContentView(root);
    }
    
    /**
     * Open the PDF in an external app via Intent chooser.
     */
    private void openWithExternalApp() {
        if (pdfUri == null) {
            Log.e(TAG, "No PDF URI to open externally");
            return;
        }
        
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(pdfUri, "application/pdf");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // Use chooser to let user pick the app
            Intent chooser = Intent.createChooser(intent, null);
            startActivity(chooser);
        } catch (Exception e) {
            Log.e(TAG, "Failed to open PDF externally: " + e.getMessage());
            crashLogger.recordError("PdfViewer", "openWithExternalApp", e);
        }
    }
    
    /**
     * Build a calm, non-alarming error view for when PDF can't be opened.
     */
    private FrameLayout buildCalmErrorView() {
        FrameLayout container = new FrameLayout(this);
        container.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        container.setBackgroundColor(0xFF1A1A1A);
        
        android.widget.LinearLayout content = new android.widget.LinearLayout(this);
        content.setOrientation(android.widget.LinearLayout.VERTICAL);
        content.setGravity(android.view.Gravity.CENTER);
        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        contentParams.gravity = android.view.Gravity.CENTER;
        content.setLayoutParams(contentParams);
        content.setPadding(dpToPx(48), dpToPx(48), dpToPx(48), dpToPx(48));
        
        TextView icon = new TextView(this);
        icon.setText("—");
        icon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 48);
        icon.setTextColor(0x66FFFFFF);
        icon.setGravity(android.view.Gravity.CENTER);
        content.addView(icon);
        
        TextView message = new TextView(this);
        message.setText("This document is no longer available");
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        message.setTextColor(0xCCFFFFFF);
        message.setGravity(android.view.Gravity.CENTER);
        message.setPadding(0, dpToPx(24), 0, dpToPx(8));
        content.addView(message);
        
        TextView hint = new TextView(this);
        hint.setText("Tap anywhere to close");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        hint.setTextColor(0x88FFFFFF);
        hint.setGravity(android.view.Gravity.CENTER);
        content.addView(hint);
        
        container.addView(content);
        container.setOnClickListener(v -> exitViewer());
        
        return container;
    }
    
    private void showCalmErrorState() {
        if (recyclerView != null) {
            recyclerView.setVisibility(View.GONE);
        }
        if (topBar != null) {
            topBar.setVisibility(View.GONE);
        }
        if (errorView != null) {
            errorView.setVisibility(View.VISIBLE);
        }
        hideHandler.removeCallbacks(hideRunnable);
    }
    
    private void setupGestureDetectors() {
        // Scale gesture for pinch-to-zoom (now controls canvas-level zoom)
        scaleGestureDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            private float startZoom = 1.0f;
            
            @Override
            public boolean onScaleBegin(ScaleGestureDetector detector) {
                isScaling = true;
                startZoom = recyclerView.getZoomLevel();
                recyclerView.beginZoomGesture(detector.getFocusX(), detector.getFocusY());
                crashLogger.addBreadcrumb(CrashLogger.CAT_ZOOM, "Pinch zoom started at " + startZoom + "x");
                return true;
            }
            
            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                float scaleFactor = detector.getScaleFactor();
                float newZoom = startZoom * scaleFactor;
                newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
                
                float fx = detector.getFocusX();
                float fy = detector.getFocusY();
                
                // When zooming out below 1.0x, blend focal point toward screen center
                // This prevents content from drifting off-screen (Google Drive behavior)
                if (newZoom < 1.0f) {
                    float centerX = recyclerView.getWidth() / 2f;
                    float centerY = recyclerView.getHeight() / 2f;
                    // Blend factor: 0 at 1.0x, approaches 1 at MIN_ZOOM
                    float t = (1.0f - newZoom) / (1.0f - MIN_ZOOM);
                    t = Math.min(1.0f, t); // Clamp to 1.0
                    fx = fx + (centerX - fx) * t;
                    fy = fy + (centerY - fy) * t;
                }
                
                recyclerView.setZoom(newZoom, fx, fy);
                return true;
            }
            
            @Override
            public void onScaleEnd(ScaleGestureDetector detector) {
                isScaling = false;
                
                previousZoom = currentZoom;
                currentZoom = recyclerView.getZoomLevel();
                recyclerView.commitZoomGesture();
                
                crashLogger.addBreadcrumb(CrashLogger.CAT_ZOOM, "Pinch zoom ended: " + previousZoom + "x → " + currentZoom + "x");
                
                // Trigger high-res re-render at new zoom level
                commitZoomAndRerender();
            }
        });
        
        // Tap gesture for show/hide UI and double-tap zoom
        gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                toggleTopBar();
                return true;
            }
            
            @Override
            public boolean onDoubleTap(MotionEvent e) {
                if (isDoubleTapAnimating) return true;
                
                float targetZoom;
                if (currentZoom < 0.9f) {
                    // Zoomed out → fit to width
                    targetZoom = FIT_PAGE_ZOOM;
                } else if (currentZoom > 1.5f) {
                    // Zoomed in → fit to width
                    targetZoom = FIT_PAGE_ZOOM;
                } else {
                    // At fit → zoom in
                    targetZoom = DOUBLE_TAP_ZOOM;
                }
                
                animateDoubleTapZoom(currentZoom, targetZoom, e.getX(), e.getY());
                return true;
            }
        });
        
        // Attach touch listener to RecyclerView
        recyclerView.setOnTouchListener((v, event) -> {
            scaleGestureDetector.onTouchEvent(event);
            gestureDetector.onTouchEvent(event);
            return false; // Allow scroll to proceed
        });
    }
    
    /**
     * Animate double-tap zoom using canvas-level zoom.
     */
    private void animateDoubleTapZoom(float startZoom, float endZoom, float fx, float fy) {
        crashLogger.addBreadcrumb(CrashLogger.CAT_ZOOM, "Double-tap zoom: " + startZoom + "x → " + endZoom + "x");
        
        isDoubleTapAnimating = true;
        previousZoom = startZoom;
        
        recyclerView.animateZoomTo(endZoom, fx, fy, () -> {
            isDoubleTapAnimating = false;
            currentZoom = endZoom;
            commitZoomAndRerender();
        });
    }
    
    /**
     * Commit zoom and trigger high-res re-render.
     */
    private void commitZoomAndRerender() {
        renderGeneration.incrementAndGet();
        pendingRenders.clear();
        prerenderVisiblePages();
    }
    
    /**
     * Trigger immediate high-res rendering for all visible pages.
     */
    private void prerenderVisiblePages() {
        if (adapter == null || pdfRenderer == null || renderExecutor == null) return;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int first = layoutManager.findFirstVisibleItemPosition();
        int last = layoutManager.findLastVisibleItemPosition();
        
        for (int i = first; i <= last; i++) {
            String cacheKey = getCacheKey(i, currentZoom, false);
            if (!pendingRenders.contains(cacheKey)) {
                final int pageIndex = i;
                pendingRenders.add(cacheKey);
                renderExecutor.execute(() -> renderPageAsync(pageIndex, currentZoom, false));
            }
        }
    }
    
    private boolean openPdf(Uri uri) {
        long startTime = System.currentTimeMillis();
        crashLogger.addBreadcrumb(CrashLogger.CAT_IO, "openPdf started: " + uri);
        
        try {
            fileDescriptor = getContentResolver().openFileDescriptor(uri, "r");
            if (fileDescriptor == null) {
                crashLogger.recordError("PdfViewer", "openPdf", "FileDescriptor is null",
                    "uri", uri.toString());
                Log.e(TAG, "Failed to open file descriptor");
                return false;
            }
            
            pdfRenderer = new PdfRenderer(fileDescriptor);
            int pageCount = pdfRenderer.getPageCount();
            crashLogger.setCustomKey("pdf_page_count", String.valueOf(pageCount));
            Log.d(TAG, "Opened PDF with " + pageCount + " pages");
            
            // Pre-cache all page dimensions
            pageWidths = new int[pageCount];
            pageHeights = new int[pageCount];
            
            for (int i = 0; i < pageCount; i++) {
                PdfRenderer.Page page = pdfRenderer.openPage(i);
                pageWidths[i] = page.getWidth();
                pageHeights[i] = page.getHeight();
                page.close();
            }
            
            crashLogger.logPerformance("PdfViewer", "openPdf", System.currentTimeMillis() - startTime);
            crashLogger.addBreadcrumb(CrashLogger.CAT_IO, "openPdf success: " + pageCount + " pages");
            Log.d(TAG, "Cached dimensions for " + pageCount + " pages");
            
            return true;
            
        } catch (IOException e) {
            crashLogger.recordError("PdfViewer", "openPdf", e, "uri", uri.toString());
            Log.e(TAG, "Failed to open PDF: " + e.getMessage());
            return false;
        } catch (SecurityException e) {
            crashLogger.recordError("PdfViewer", "openPdf", e, "uri", uri.toString());
            Log.e(TAG, "Security exception opening PDF: " + e.getMessage());
            return false;
        } catch (OutOfMemoryError oom) {
            crashLogger.recordError("PdfViewer", "openPdf", oom, "uri", uri.toString());
            Log.e(TAG, "OOM opening PDF: " + oom.getMessage());
            return false;
        }
    }
    
    private void setupRecyclerView() {
        LinearLayoutManager layoutManager = new LinearLayoutManager(this, RecyclerView.VERTICAL, false);
        recyclerView.setLayoutManager(layoutManager);
        
        // Add page gap decoration
        int pageGapPx = dpToPx(PAGE_GAP_DP);
        recyclerView.addItemDecoration(new RecyclerView.ItemDecoration() {
            @Override
            public void getItemOffsets(@NonNull Rect outRect, @NonNull View view, 
                    @NonNull RecyclerView parent, @NonNull RecyclerView.State state) {
                int position = parent.getChildAdapterPosition(view);
                if (position > 0) {
                    outRect.top = pageGapPx;
                }
            }
        });
        
        adapter = new PdfPageAdapter();
        recyclerView.setAdapter(adapter);
        
        // Add scroll listener for page indicator and header auto-hide
        recyclerView.addOnScrollListener(new RecyclerView.OnScrollListener() {
            private int lastDy = 0;
            private int accumulatedDy = 0;
            
            @Override
            public void onScrolled(@NonNull RecyclerView rv, int dx, int dy) {
                super.onScrolled(rv, dx, dy);
                
                // Update page indicator
                updatePageIndicator();
                
                // Prerender nearby pages
                LinearLayoutManager lm = (LinearLayoutManager) rv.getLayoutManager();
                if (lm != null) {
                    prerenderNearbyPages(lm.findFirstVisibleItemPosition());
                }
                
                // Scroll-based header show/hide
                accumulatedDy += dy;
                
                if (accumulatedDy > SCROLL_THRESHOLD) {
                    // Scrolling down - hide header
                    hideTopBar();
                    accumulatedDy = 0;
                } else if (accumulatedDy < -SCROLL_THRESHOLD) {
                    // Scrolling up - show header
                    showTopBar();
                    accumulatedDy = 0;
                }
            }
            
            @Override
            public void onScrollStateChanged(@NonNull RecyclerView recyclerView, int newState) {
                super.onScrollStateChanged(recyclerView, newState);
                if (newState == RecyclerView.SCROLL_STATE_IDLE) {
                    accumulatedDy = 0;
                }
            }
        });
        
        updatePageIndicator();
    }
    
    /**
     * Pre-render pages near the visible area for smooth scrolling.
     */
    private void prerenderNearbyPages(int centerPage) {
        if (adapter == null || pdfRenderer == null || renderExecutor == null) return;
        if (pageWidths == null) return;
        
        int start = Math.max(0, centerPage - PRERENDER_PAGES);
        int end = Math.min(pageWidths.length - 1, centerPage + PRERENDER_PAGES);
        
        for (int i = start; i <= end; i++) {
            String cacheKey = getCacheKey(i, currentZoom, false);
            if (bitmapCache.get(cacheKey) == null && !pendingRenders.contains(cacheKey)) {
                final int pageIndex = i;
                pendingRenders.add(cacheKey);
                renderExecutor.execute(() -> renderPageAsync(pageIndex, currentZoom, false));
            }
        }
    }
    
    private void updatePageIndicator() {
        if (pageIndicator == null || pageWidths == null) return;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int currentPage = layoutManager.findFirstVisibleItemPosition() + 1;
        int totalPages = pageWidths.length;
        
        if (currentPage > 0 && totalPages > 0) {
            pageIndicator.setText(currentPage + " / " + totalPages);
        }
    }
    
    private void toggleTopBar() {
        if (isTopBarVisible) {
            hideTopBar();
        } else {
            showTopBar();
        }
    }
    
    private void showTopBar() {
        if (topBar != null && !isTopBarVisible) {
            isTopBarVisible = true;
            topBar.animate()
                .alpha(1f)
                .translationY(0)
                .setDuration(200)
                .withStartAction(() -> topBar.setVisibility(View.VISIBLE))
                .start();
            scheduleHide();
        } else if (topBar != null && isTopBarVisible) {
            // Already visible, just reschedule hide
            scheduleHide();
        }
    }
    
    private void hideTopBar() {
        if (topBar != null && isTopBarVisible) {
            isTopBarVisible = false;
            hideHandler.removeCallbacks(hideRunnable);
            topBar.animate()
                .alpha(0f)
                .translationY(-topBar.getHeight())
                .setDuration(200)
                .withEndAction(() -> {
                    // Keep visibility but make it hidden via alpha/translation
                })
                .start();
        }
    }
    
    private void scheduleHide() {
        hideHandler.removeCallbacks(hideRunnable);
        hideHandler.postDelayed(hideRunnable, AUTO_HIDE_DELAY_MS);
    }
    
    private void loadResumeState() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        
        resumePageIndex = prefs.getInt(shortcutId + "_page", 0);
        resumePixelOffset = prefs.getInt(shortcutId + "_offset", 0);
        resumeScrollFraction = prefs.getFloat(shortcutId + "_fraction", 0f);
        resumeZoom = prefs.getFloat(shortcutId + "_zoom", 1.0f);
        
        int savedScreenWidth = prefs.getInt(shortcutId + "_screenWidth", screenWidth);
        if (savedScreenWidth != screenWidth) {
            resumePixelOffset = Integer.MIN_VALUE;
        }
        
        Log.d(TAG, "Loaded resume state: page=" + resumePageIndex + 
              ", offset=" + resumePixelOffset + ", fraction=" + resumeScrollFraction + 
              ", zoom=" + resumeZoom);
    }
    
    private void saveResumeState() {
        if (shortcutId == null || !resumeEnabled) return;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int firstVisiblePage = layoutManager.findFirstVisibleItemPosition();
        if (firstVisiblePage < 0) return;
        
        View firstVisibleView = layoutManager.findViewByPosition(firstVisiblePage);
        if (firstVisibleView == null) return;
        
        int pixelOffset = firstVisibleView.getTop();
        
        int pageHeight = firstVisibleView.getHeight();
        float scrollFraction = 0f;
        if (pageHeight > 0) {
            scrollFraction = (float) -pixelOffset / pageHeight;
            scrollFraction = Math.max(0f, Math.min(1f, scrollFraction));
        }
        
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putInt(shortcutId + "_page", firstVisiblePage)
            .putInt(shortcutId + "_offset", pixelOffset)
            .putFloat(shortcutId + "_fraction", scrollFraction)
            .putFloat(shortcutId + "_zoom", currentZoom)
            .putInt(shortcutId + "_screenWidth", screenWidth)
            .putLong(shortcutId + "_timestamp", System.currentTimeMillis())
            .apply();
        
        Log.d(TAG, "Saved resume state: page=" + firstVisiblePage + 
              ", offset=" + pixelOffset + ", fraction=" + scrollFraction + 
              ", zoom=" + currentZoom);
    }
    
    private void restoreResumePosition() {
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        if (resumePixelOffset == Integer.MIN_VALUE) {
            layoutManager.scrollToPositionWithOffset(resumePageIndex, 0);
            
            recyclerView.post(() -> {
                View pageView = layoutManager.findViewByPosition(resumePageIndex);
                if (pageView != null) {
                    int pageHeight = pageView.getHeight();
                    int targetOffset = -(int)(resumeScrollFraction * pageHeight);
                    layoutManager.scrollToPositionWithOffset(resumePageIndex, targetOffset);
                    Log.d(TAG, "Restored via fraction: page=" + resumePageIndex + 
                          ", fraction=" + resumeScrollFraction + ", offset=" + targetOffset);
                }
            });
        } else {
            layoutManager.scrollToPositionWithOffset(resumePageIndex, resumePixelOffset);
            Log.d(TAG, "Restored pixel-accurate: page=" + resumePageIndex + 
                  ", offset=" + resumePixelOffset);
        }
    }
    
    private int dpToPx(int dp) {
        return (int) (dp * density + 0.5f);
    }
    
    private String getCacheKey(int pageIndex, float zoom, boolean lowRes) {
        return pageIndex + "_" + String.format(Locale.US, "%.2f", zoom) + (lowRes ? "_low" : "_high");
    }
    
    private Bitmap findFallbackBitmap(int pageIndex) {
        if (previousZoom != currentZoom) {
            Bitmap fallback = bitmapCache.get(getCacheKey(pageIndex, previousZoom, false));
            if (fallback != null) return fallback;
            
            fallback = bitmapCache.get(getCacheKey(pageIndex, previousZoom, true));
            if (fallback != null) return fallback;
        }
        
        if (currentZoom != 1.0f && previousZoom != 1.0f) {
            Bitmap fallback = bitmapCache.get(getCacheKey(pageIndex, 1.0f, false));
            if (fallback != null) return fallback;
            
            fallback = bitmapCache.get(getCacheKey(pageIndex, 1.0f, true));
            if (fallback != null) return fallback;
        }
        
        return null;
    }
    
    /**
     * Get cached page height at 1.0x zoom (layout size).
     * Visual zoom is handled at canvas level.
     */
    private int getScaledPageHeight(int pageIndex) {
        if (pageWidths == null || pageIndex < 0 || pageIndex >= pageWidths.length) {
            return screenHeight / 2;
        }
        // Layout dimensions always at 1.0x - canvas-level zoom handles visual scaling
        float scale = (float) screenWidth / pageWidths[pageIndex];
        return (int) (pageHeights[pageIndex] * scale);
    }
    
    /**
     * Render a page asynchronously with low-res → high-res atomic swap.
     */
    private void renderPageAsync(int pageIndex, float targetZoom, boolean lowResOnly) {
        final int generation = renderGeneration.get();
        final long startTime = System.currentTimeMillis();
        
        try {
            if (renderGeneration.get() != generation) {
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            if (pageWidths == null || pageIndex < 0 || pageIndex >= pageWidths.length) {
                crashLogger.logWarning("PdfViewer", "Invalid page index: " + pageIndex);
                Log.e(TAG, "Invalid page index or dimensions not cached: " + pageIndex);
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            int pageWidth = pageWidths[pageIndex];
            int pageHeight = pageHeights[pageIndex];
            
            float baseScale = (float) screenWidth / pageWidth;
            
            // --- Low-res pass ---
            float lowScale = baseScale * targetZoom * LOW_RES_SCALE;
            int lowWidth = Math.max(1, (int) (pageWidth * lowScale));
            int lowHeight = Math.max(1, (int) (pageHeight * lowScale));
            
            Bitmap lowBitmap = Bitmap.createBitmap(lowWidth, lowHeight, Bitmap.Config.ARGB_8888);
            lowBitmap.eraseColor(Color.WHITE);
            
            Log.d(TAG, "Rendering page " + pageIndex + " low-res: " + lowWidth + "x" + lowHeight);
            
            boolean lowResSuccess = false;
            PdfRenderer localRenderer = pdfRenderer;
            if (localRenderer == null) {
                lowBitmap.recycle();
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            synchronized (localRenderer) {
                if (pdfRenderer == null || pageIndex < 0 || pageIndex >= localRenderer.getPageCount()) {
                    lowBitmap.recycle();
                    pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                    return;
                }
                
                try {
                    PdfRenderer.Page page = localRenderer.openPage(pageIndex);
                    page.render(lowBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    page.close();
                    lowResSuccess = true;
                    Log.d(TAG, "Low-res render success for page " + pageIndex);
                } catch (Exception e) {
                    Log.e(TAG, "Low-res render failed for page " + pageIndex, e);
                }
            }
            
            if (!lowResSuccess) {
                lowBitmap.recycle();
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            String lowKey = getCacheKey(pageIndex, targetZoom, true);
            bitmapCache.put(lowKey, lowBitmap);
            
            final int finalHeight = (int) (pageHeight * baseScale);
            mainHandler.post(() -> {
                if (renderGeneration.get() == generation) {
                    adapter.updatePageBitmap(pageIndex, lowBitmap, finalHeight, true);
                }
            });
            
            if (lowResOnly) {
                return;
            }
            
            if (renderGeneration.get() != generation) {
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            // --- High-res pass ---
            float highScale = baseScale * targetZoom;
            int highWidth = Math.max(1, (int) (pageWidth * highScale));
            int highHeight = Math.max(1, (int) (pageHeight * highScale));
            
            Bitmap highBitmap = Bitmap.createBitmap(highWidth, highHeight, Bitmap.Config.ARGB_8888);
            highBitmap.eraseColor(Color.WHITE);
            
            localRenderer = pdfRenderer;
            if (localRenderer == null) {
                highBitmap.recycle();
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            synchronized (localRenderer) {
                if (pdfRenderer == null || pageIndex < 0 || pageIndex >= localRenderer.getPageCount()) {
                    highBitmap.recycle();
                    pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                    return;
                }
                
                PdfRenderer.Page page = localRenderer.openPage(pageIndex);
                page.render(highBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                page.close();
            }
            
            String highKey = getCacheKey(pageIndex, targetZoom, false);
            bitmapCache.put(highKey, highBitmap);
            pendingRenders.remove(highKey);
            
            mainHandler.post(() -> {
                if (renderGeneration.get() == generation) {
                    adapter.updatePageBitmap(pageIndex, highBitmap, finalHeight, false);
                }
            });
        } catch (OutOfMemoryError oom) {
            crashLogger.recordError("PdfViewer", "renderPageAsync", oom,
                "pageIndex", String.valueOf(pageIndex),
                "targetZoom", String.valueOf(targetZoom));
            Log.e(TAG, "OOM rendering page " + pageIndex, oom);
            pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
            
            if (bitmapCache != null) {
                bitmapCache.evictAll();
            }
        } catch (Exception e) {
            crashLogger.recordError("PdfViewer", "renderPageAsync", e,
                "pageIndex", String.valueOf(pageIndex),
                "targetZoom", String.valueOf(targetZoom));
            Log.e(TAG, "Failed to render page " + pageIndex, e);
            pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
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
        crashLogger.addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "PdfViewer.onDestroy started");
        
        hideHandler.removeCallbacks(hideRunnable);
        
        if (doubleTapAnimator != null && doubleTapAnimator.isRunning()) {
            doubleTapAnimator.cancel();
        }
        doubleTapAnimator = null;
        
        PdfRenderer rendererToClose = pdfRenderer;
        ParcelFileDescriptor fdToClose = fileDescriptor;
        pdfRenderer = null;
        fileDescriptor = null;
        
        if (renderExecutor != null) {
            crashLogger.addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "Shutting down render executor");
            renderExecutor.shutdownNow();
            try {
                boolean terminated = renderExecutor.awaitTermination(500, TimeUnit.MILLISECONDS);
                if (!terminated) {
                    crashLogger.logWarning("PdfViewer", "Executor did not terminate within 500ms");
                }
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
                crashLogger.logWarning("PdfViewer", "Executor shutdown interrupted");
            }
            renderExecutor = null;
        }
        
        if (bitmapCache != null) {
            bitmapCache.evictAll();
        }
        
        if (rendererToClose != null) {
            try {
                rendererToClose.close();
                crashLogger.addBreadcrumb(CrashLogger.CAT_IO, "PdfRenderer closed");
            } catch (Exception e) {
                crashLogger.recordError("PdfViewer", "onDestroy", e, "resource", "pdfRenderer");
            }
        }
        
        if (fdToClose != null) {
            try {
                fdToClose.close();
                crashLogger.addBreadcrumb(CrashLogger.CAT_IO, "FileDescriptor closed");
            } catch (Exception e) {
                crashLogger.recordError("PdfViewer", "onDestroy", e, "resource", "fileDescriptor");
            }
        }
        
        crashLogger.addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "PdfViewer.onDestroy complete");
    }
    
    @Override
    public void onBackPressed() {
        exitViewer();
    }
    
    private void exitViewer() {
        hideHandler.removeCallbacks(hideRunnable);
        saveResumeState();
        finish();
        overridePendingTransition(0, android.R.anim.fade_out);
    }
    
    /**
     * RecyclerView adapter for PDF pages.
     * Layout is always at 1.0x - visual zoom happens at canvas level.
     */
    private class PdfPageAdapter extends RecyclerView.Adapter<PdfPageAdapter.PageViewHolder> {
        
        @NonNull
        @Override
        public PageViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            ImageView imageView = new ImageView(parent.getContext());
            imageView.setLayoutParams(new RecyclerView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ));
            imageView.setScaleType(ImageView.ScaleType.FIT_CENTER);
            imageView.setBackgroundColor(0xFFFFFFFF);
            return new PageViewHolder(imageView);
        }
        
        @Override
        public void onBindViewHolder(@NonNull PageViewHolder holder, int position) {
            holder.pageIndex = position;
            
            // Set height from cached dimensions (always 1.0x for layout)
            int height = getScaledPageHeight(position);
            ViewGroup.LayoutParams params = holder.imageView.getLayoutParams();
            params.height = height;
            holder.imageView.setLayoutParams(params);
            
            // Multi-level fallback to avoid white flashes
            String highKey = getCacheKey(position, currentZoom, false);
            String lowKey = getCacheKey(position, currentZoom, true);
            
            Bitmap cached = bitmapCache.get(highKey);
            if (cached != null && !cached.isRecycled()) {
                holder.imageView.setImageBitmap(cached);
                return;
            }
            
            cached = bitmapCache.get(lowKey);
            if (cached != null && !cached.isRecycled()) {
                holder.imageView.setImageBitmap(cached);
            } else {
                Bitmap fallback = findFallbackBitmap(position);
                if (fallback != null && !fallback.isRecycled()) {
                    holder.imageView.setImageBitmap(fallback);
                } else {
                    holder.imageView.setImageBitmap(null);
                    holder.imageView.setBackgroundColor(0xFFFFFFFF);
                }
            }
            
            // Trigger render if not already pending
            if (!pendingRenders.contains(highKey) && renderExecutor != null) {
                pendingRenders.add(highKey);
                renderExecutor.execute(() -> renderPageAsync(position, currentZoom, false));
            }
        }
        
        /**
         * Update a specific page with a new bitmap.
         */
        void updatePageBitmap(int pageIndex, Bitmap bitmap, int height, boolean isLowRes) {
            LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
            if (layoutManager == null) return;
            
            int first = layoutManager.findFirstVisibleItemPosition();
            int last = layoutManager.findLastVisibleItemPosition();
            
            if (pageIndex >= first && pageIndex <= last) {
                View child = layoutManager.findViewByPosition(pageIndex);
                if (child instanceof ImageView) {
                    ImageView imageView = (ImageView) child;
                    
                    Bitmap current = null;
                    if (imageView.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
                        current = ((android.graphics.drawable.BitmapDrawable) imageView.getDrawable()).getBitmap();
                    }
                    
                    String highKey = getCacheKey(pageIndex, currentZoom, false);
                    boolean shouldUpdate = !isLowRes || current == null || bitmapCache.get(highKey) == null;
                    
                    if (shouldUpdate && bitmap != null && !bitmap.isRecycled()) {
                        imageView.setImageBitmap(bitmap);
                        
                        ViewGroup.LayoutParams params = imageView.getLayoutParams();
                        if (params.height != height) {
                            params.height = height;
                            imageView.setLayoutParams(params);
                        }
                    }
                }
            }
        }
        
        @Override
        public int getItemCount() {
            return pageWidths != null ? pageWidths.length : 0;
        }
        
        @Override
        public void onViewRecycled(@NonNull PageViewHolder holder) {
            super.onViewRecycled(holder);
            holder.imageView.setImageBitmap(null);
        }
        
        class PageViewHolder extends RecyclerView.ViewHolder {
            ImageView imageView;
            int pageIndex = -1;
            
            PageViewHolder(ImageView view) {
                super(view);
                this.imageView = view;
            }
        }
    }
}
