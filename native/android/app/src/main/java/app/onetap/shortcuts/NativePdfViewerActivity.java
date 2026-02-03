package app.onetap.shortcuts;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
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
import java.util.HashSet;
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
 * - Pinch-to-zoom with focal anchoring
 * - Double-tap to toggle fit/zoom
 * - Low-res → high-res atomic swap (no blur during zoom)
 * - LRU bitmap cache for smooth scrolling
 * - Resume position (scroll + zoom persisted)
 * - Auto-hiding close button
 * 
 * Explicitly excluded (by design):
 * - Search, annotations, thumbnails, reading modes, page overlays
 * 
 * Philosophy: Display content. That's it.
 */
public class NativePdfViewerActivity extends Activity {
    
    private static final String TAG = "NativePdfViewer";
    private static final String PREFS_NAME = "pdf_resume_positions";
    private static final int AUTO_HIDE_DELAY_MS = 6000; // Extended to ensure page indicator is seen
    private static final float MIN_ZOOM = 1.0f;
    private static final float MAX_ZOOM = 5.0f;
    private static final float DOUBLE_TAP_ZOOM = 2.5f;
    
    // Pre-render pages above/below viewport for smooth scrolling
    private static final int PRERENDER_PAGES = 2;
    
    // Low-res scale factor for instant preview (0.5x = half resolution)
    private static final float LOW_RES_SCALE = 0.5f;
    
    // Page gap in dp
    private static final int PAGE_GAP_DP = 8;
    
    // Core components
    private RecyclerView recyclerView;
    private PdfPageAdapter adapter;
    private PdfRenderer pdfRenderer;
    private ParcelFileDescriptor fileDescriptor;
    
    // Cached page dimensions (avoids synchronous PDF access during binding)
    private int[] pageWidths;
    private int[] pageHeights;
    
    // Bitmap cache (LRU, sized for ~10 pages at screen resolution)
    private LruCache<String, Bitmap> bitmapCache;
    
    // Track which pages are being rendered to avoid duplicates
    // THREAD-SAFE: Uses ConcurrentHashMap.newKeySet() to prevent ConcurrentModificationException
    // when background render threads remove keys while main thread iterates/adds
    private final Set<String> pendingRenders = ConcurrentHashMap.newKeySet();
    
    // Track pages awaiting zoom swap (scale reset deferred until high-res arrives)
    private final Set<Integer> pendingZoomSwap = new HashSet<>();
    // The scale factor that pending views are currently displaying
    private float pendingVisualScale = 1.0f;
    
    // Previous zoom level (for fallback bitmap lookup during transitions)
    private float previousZoom = 1.0f;
    
    // Error state UI (shown instead of RecyclerView when PDF can't be opened)
    private FrameLayout errorView;
    
    // UI chrome
    private FrameLayout topBar;
    private ImageButton closeButton;
    private TextView pageIndicator;
    private boolean isTopBarVisible = true;
    
    // Zoom state
    private float currentZoom = 1.0f;
    private float pendingZoom = 1.0f; // Zoom during gesture (before high-res render)
    private ScaleGestureDetector scaleGestureDetector;
    private GestureDetector gestureDetector;
    private float focalX, focalY;
    private boolean isScaling = false;
    
    // Double-tap zoom animation
    private static final int DOUBLE_TAP_ANIM_DURATION_MS = 220;
    private ValueAnimator doubleTapAnimator;
    private boolean isDoubleTapAnimating = false;
    
    // Resume state
    private String shortcutId;
    private boolean resumeEnabled = true;
    private int resumePageIndex = 0;        // Which page
    private int resumePixelOffset = 0;      // Pixel offset within page (negative = scrolled past top)
    private float resumeScrollFraction = 0; // Fallback: fraction of page scrolled (0.0-1.0)
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
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Initialize crash logging
        crashLogger.initialize(this);
        crashLogger.addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "PdfViewer.onCreate started");
        
        // KEEP SCREEN AWAKE during reading
        // Uses FLAG_KEEP_SCREEN_ON which is:
        // - Activity-scoped: automatically released when activity goes to background
        // - No permission required
        // - No service needed
        // - Silent: no notification or UI
        // - Battery-safe: only active while visible
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
            
            @Override
            protected void entryRemoved(boolean evicted, String key, Bitmap oldValue, Bitmap newValue) {
                if (evicted && oldValue != null && !oldValue.isRecycled()) {
                    oldValue.recycle();
                }
            }
        };
        
        // Extract intent data
        Uri pdfUri = getIntent().getData();
        shortcutId = getIntent().getStringExtra("shortcut_id");
        resumeEnabled = getIntent().getBooleanExtra("resume", true);
        
        // Initialize render executor early (before UI, handles all paths including error states)
        // 3 threads: 1 for low-res, 2 for high-res
        renderExecutor = Executors.newFixedThreadPool(3);
        
        if (pdfUri == null) {
            crashLogger.recordError("PdfViewer", "onCreate", "No PDF URI provided", 
                "shortcutId", String.valueOf(shortcutId));
            Log.e(TAG, "No PDF URI provided");
            // Build UI first so we can show error state
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
        
        // Open PDF - show calm error state if it fails
        if (!openPdf(pdfUri)) {
            Log.e(TAG, "Failed to open PDF");
            showCalmErrorState();
            return;
        }
        
        // Setup adapter
        setupRecyclerView();
        
        // Restore resume position after layout (pixel-accurate)
        if (resumeEnabled && (resumePageIndex > 0 || resumePixelOffset != 0)) {
            recyclerView.post(() -> restoreResumePosition());
        }
        
        // Apply resume zoom
        if (resumeEnabled && resumeZoom != 1.0f) {
            currentZoom = resumeZoom;
            pendingZoom = resumeZoom;
            applyZoom();
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
        
        // RecyclerView for pages
        recyclerView = new RecyclerView(this);
        recyclerView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        recyclerView.setBackgroundColor(0xFF1A1A1A); // Dark gray for page gaps
        recyclerView.setHasFixedSize(false);
        recyclerView.setItemAnimator(null); // Disable animations for smooth scrolling
        
        // Enable edge glow for native scroll feel
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
        
        // Close button
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
        
        // Page indicator (subtle, top-right)
        pageIndicator = new TextView(this);
        pageIndicator.setTextColor(0xAAFFFFFF);
        pageIndicator.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        FrameLayout.LayoutParams indicatorParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        indicatorParams.gravity = android.view.Gravity.END | android.view.Gravity.CENTER_VERTICAL;
        pageIndicator.setLayoutParams(indicatorParams);
        topBar.addView(pageIndicator);
        
        root.addView(topBar);
        
        // Error view (hidden by default, shown if PDF fails to open)
        errorView = buildCalmErrorView();
        errorView.setVisibility(View.GONE);
        root.addView(errorView);
        
        setContentView(root);
    }
    
    /**
     * Build a calm, non-alarming error view for when PDF can't be opened.
     * 
     * Design principles:
     * - No blocking dialogs
     * - No technical error messages  
     * - One clear explanation
     * - One clear escape (tap anywhere to close)
     * - Muted colors (not red, not alarming)
     * - Centered, minimal layout
     */
    private FrameLayout buildCalmErrorView() {
        FrameLayout container = new FrameLayout(this);
        container.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        container.setBackgroundColor(0xFF1A1A1A); // Same as viewer background
        
        // Centered content container
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
        
        // Subtle icon (document with X, but we'll use a simple dash for calm feel)
        TextView icon = new TextView(this);
        icon.setText("—");
        icon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 48);
        icon.setTextColor(0x66FFFFFF); // Very muted
        icon.setGravity(android.view.Gravity.CENTER);
        content.addView(icon);
        
        // Primary message - calm, informative, no blame
        TextView message = new TextView(this);
        message.setText("This document is no longer available");
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        message.setTextColor(0xCCFFFFFF); // Slightly muted white
        message.setGravity(android.view.Gravity.CENTER);
        message.setPadding(0, dpToPx(24), 0, dpToPx(8));
        content.addView(message);
        
        // Secondary hint - the escape path
        TextView hint = new TextView(this);
        hint.setText("Tap anywhere to close");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        hint.setTextColor(0x88FFFFFF); // More muted
        hint.setGravity(android.view.Gravity.CENTER);
        content.addView(hint);
        
        container.addView(content);
        
        // Tap anywhere to exit
        container.setOnClickListener(v -> exitViewer());
        
        return container;
    }
    
    /**
     * Show calm error state when PDF can't be opened.
     * Hides the RecyclerView and top bar, shows a minimal error message.
     * User can tap anywhere to exit.
     */
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
        
        // Cancel any pending hide actions
        hideHandler.removeCallbacks(hideRunnable);
    }
    
    private void setupGestureDetectors() {
        // Scale gesture for pinch-to-zoom
        scaleGestureDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScaleBegin(ScaleGestureDetector detector) {
                isScaling = true;
                focalX = detector.getFocusX();
                focalY = detector.getFocusY();
                crashLogger.addBreadcrumb(CrashLogger.CAT_ZOOM, "Pinch zoom started at " + currentZoom + "x");
                return true;
            }
            
            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                float scaleFactor = detector.getScaleFactor();
                float newZoom = pendingZoom * scaleFactor;
                
                // Clamp zoom
                newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
                
                if (newZoom != pendingZoom) {
                    pendingZoom = newZoom;
                    // Apply CSS-like scale during gesture (no re-render)
                    applyVisualZoom();
                }
                
                return true;
            }
            
            @Override
            public void onScaleEnd(ScaleGestureDetector detector) {
                isScaling = false;
                
                // Track previous zoom for fallback bitmap lookup
                previousZoom = currentZoom;
                
                // Commit zoom level
                currentZoom = pendingZoom;
                crashLogger.addBreadcrumb(CrashLogger.CAT_ZOOM, "Pinch zoom ended: " + previousZoom + "x → " + currentZoom + "x");
                
                // CRITICAL: Do NOT reset visual scale here - that causes the snap-back
                // Instead, trigger high-res re-render and keep scaled bitmap visible
                // Scale reset happens atomically when high-res bitmap arrives
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
                // Don't start new animation if one is in progress
                if (isDoubleTapAnimating) return true;
                
                // Toggle between fit and 2.5x zoom
                float targetZoom;
                if (currentZoom > 1.5f) {
                    targetZoom = 1.0f;
                } else {
                    targetZoom = DOUBLE_TAP_ZOOM;
                }
                
                // Store tap position for centering
                focalX = e.getX();
                focalY = e.getY();
                
                // Animate the zoom transition
                animateDoubleTapZoom(currentZoom, targetZoom);
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
     * Apply visual zoom using ImageView scale (instant, no re-render).
     * Used during pinch gesture for 60fps responsiveness.
     * 
     * CRITICAL: focalX/focalY from ScaleGestureDetector are SCREEN coordinates.
     * ImageView.setPivotX/Y() expects VIEW-LOCAL coordinates.
     * We must convert screen → view-local for content to stay anchored under fingers.
     */
    private void applyVisualZoom() {
        if (adapter == null) return;
        
        float scaleFactor = pendingZoom / currentZoom;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int first = layoutManager.findFirstVisibleItemPosition();
        int last = layoutManager.findLastVisibleItemPosition();
        
        // Reusable array for screen location lookup (avoid allocation per child)
        int[] childLocation = new int[2];
        
        for (int i = first; i <= last; i++) {
            View child = layoutManager.findViewByPosition(i);
            if (child instanceof ImageView) {
                // Get child's position in screen coordinates
                child.getLocationOnScreen(childLocation);
                
                // Convert focal point from screen-space to view-local space
                float localX = focalX - childLocation[0];
                float localY = focalY - childLocation[1];
                
                // Clamp to view bounds to handle edge cases (pinch outside this page)
                localX = Math.max(0, Math.min(localX, child.getWidth()));
                localY = Math.max(0, Math.min(localY, child.getHeight()));
                
                // Set pivot using view-local coordinates - content now stays under fingers
                child.setPivotX(localX);
                child.setPivotY(localY);
                child.setScaleX(scaleFactor);
                child.setScaleY(scaleFactor);
            }
        }
    }
    
    /**
     * Animate double-tap zoom smoothly from startZoom to endZoom.
     * 
     * How Google Drive's double-tap feels:
     * - Physical zoom-in centered on tap point
     * - Smooth deceleration (~200ms)
     * - Content under tap stays stationary
     * - No visible rendering phases during animation
     * 
     * Implementation:
     * - Use ValueAnimator for frame-by-frame scale updates
     * - DecelerateInterpolator for natural "ease-out" feel
     * - Update visual scale on each frame (no re-render during animation)
     * - Trigger high-res render only after animation completes
     */
    private void animateDoubleTapZoom(float startZoom, float endZoom) {
        crashLogger.addBreadcrumb(CrashLogger.CAT_ZOOM, "Double-tap zoom: " + startZoom + "x → " + endZoom + "x");
        
        // Cancel any existing animation
        if (doubleTapAnimator != null && doubleTapAnimator.isRunning()) {
            doubleTapAnimator.cancel();
        }
        
        isDoubleTapAnimating = true;
        
        // Store starting zoom for scale calculation
        final float baseZoom = startZoom;
        
        // Pre-calculate view-local pivot points for all visible pages
        // (avoids getLocationOnScreen calls during animation for smoother frames)
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) {
            isDoubleTapAnimating = false;
            return;
        }
        
        int first = layoutManager.findFirstVisibleItemPosition();
        int last = layoutManager.findLastVisibleItemPosition();
        
        // Guard against invalid visible range (empty RecyclerView or layout not ready)
        if (first < 0 || last < first) {
            isDoubleTapAnimating = false;
            return;
        }
        
        // Cache pivot points before animation starts
        final int[] childLocation = new int[2];
        final float[][] pivotCache = new float[last - first + 1][2];
        
        for (int i = first; i <= last; i++) {
            View child = layoutManager.findViewByPosition(i);
            if (child != null) {
                child.getLocationOnScreen(childLocation);
                float localX = focalX - childLocation[0];
                float localY = focalY - childLocation[1];
                localX = Math.max(0, Math.min(localX, child.getWidth()));
                localY = Math.max(0, Math.min(localY, child.getHeight()));
                
                pivotCache[i - first][0] = localX;
                pivotCache[i - first][1] = localY;
                
                // Set pivot immediately (won't change during animation)
                child.setPivotX(localX);
                child.setPivotY(localY);
            }
        }
        
        final int animFirst = first;
        final int animLast = last;
        
        doubleTapAnimator = ValueAnimator.ofFloat(startZoom, endZoom);
        doubleTapAnimator.setDuration(DOUBLE_TAP_ANIM_DURATION_MS);
        doubleTapAnimator.setInterpolator(new DecelerateInterpolator(1.5f));
        
        doubleTapAnimator.addUpdateListener(animation -> {
            float animatedZoom = (float) animation.getAnimatedValue();
            float scaleFactor = animatedZoom / baseZoom;
            
            // Apply scale to all visible pages
            LinearLayoutManager lm = (LinearLayoutManager) recyclerView.getLayoutManager();
            if (lm == null) return;
            
            for (int i = animFirst; i <= animLast; i++) {
                View child = lm.findViewByPosition(i);
                if (child instanceof ImageView) {
                    child.setScaleX(scaleFactor);
                    child.setScaleY(scaleFactor);
                }
            }
        });
        
        doubleTapAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(android.animation.Animator animation) {
                isDoubleTapAnimating = false;
                
                // Track previous zoom for fallback bitmap lookup
                previousZoom = baseZoom;
                
                // Commit final zoom level
                currentZoom = endZoom;
                pendingZoom = endZoom;
                pendingVisualScale = endZoom / baseZoom;
                
                // Mark visible pages for atomic swap
                LinearLayoutManager lm = (LinearLayoutManager) recyclerView.getLayoutManager();
                if (lm != null) {
                    int f = lm.findFirstVisibleItemPosition();
                    int l = lm.findLastVisibleItemPosition();
                    for (int i = f; i <= l; i++) {
                        pendingZoomSwap.add(i);
                    }
                }
                
                // Trigger high-res render (atomic swap strategy)
                commitZoomAndRerender();
            }
            
            @Override
            public void onAnimationCancel(android.animation.Animator animation) {
                isDoubleTapAnimating = false;
            }
        });
        
        doubleTapAnimator.start();
    }
    
    /**
     * Commit zoom and trigger high-res re-render WITHOUT resetting visual scale.
     * The scale reset happens atomically when high-res bitmap arrives.
     * 
     * This is the key to avoiding visible snap-back:
     * 1. Keep the CSS-scaled bitmap on screen
     * 2. Render high-res in background
     * 3. When ready: set new bitmap AND reset scale in same frame
     */
    private void commitZoomAndRerender() {
        // Increment generation to invalidate old pending renders
        renderGeneration.incrementAndGet();
        
        // CACHE STRATEGY FIX: Do NOT evict all bitmaps on zoom change!
        // Instead, keep previous zoom bitmaps as visual fallback until new ones arrive.
        // LRU will naturally evict them as new bitmaps are added.
        // This prevents white flashes during zoom transitions.
        
        // Only clear pending renders (not completed bitmaps)
        pendingRenders.clear();
        
        // Track which pages need atomic swap (visible pages at gesture end)
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager != null) {
            int first = layoutManager.findFirstVisibleItemPosition();
            int last = layoutManager.findLastVisibleItemPosition();
            
            // Store the current visual scale for these pages
            View firstChild = layoutManager.findViewByPosition(first);
            if (firstChild != null) {
                pendingVisualScale = firstChild.getScaleX();
            }
            
            for (int i = first; i <= last; i++) {
                pendingZoomSwap.add(i);
            }
        }
        
        // DO NOT reset visual scale here - that's the bug we're fixing
        // DO NOT call notifyDataSetChanged - that triggers rebind with wrong size
        
        // Instead, directly trigger high-res renders for visible pages
        prerenderVisiblePages();
    }
    
    /**
     * Trigger immediate high-res rendering for all visible pages.
     * Called after zoom commit to start the swap pipeline.
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
    
    /**
     * Legacy invalidate for non-gesture zoom changes.
     * Resets visual scale immediately (used for programmatic zoom).
     */
    private void invalidateCacheAndRerender() {
        renderGeneration.incrementAndGet();
        
        // CACHE STRATEGY: Only evict all when truly needed (e.g., PDF reload)
        // For zoom changes, keep old bitmaps as fallback
        // bitmapCache.evictAll(); // REMOVED - let LRU handle eviction naturally
        
        pendingRenders.clear();
        pendingZoomSwap.clear();
        pendingVisualScale = 1.0f;
        
        // Reset visual scale on all visible views
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager != null) {
            int first = layoutManager.findFirstVisibleItemPosition();
            int last = layoutManager.findLastVisibleItemPosition();
            
            for (int i = first; i <= last; i++) {
                View child = layoutManager.findViewByPosition(i);
                if (child instanceof ImageView) {
                    child.setScaleX(1f);
                    child.setScaleY(1f);
                }
            }
        }
        
        // Notify adapter to re-render
        adapter.notifyDataSetChanged();
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
            
            // Pre-cache all page dimensions to avoid synchronous access during binding
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
        
        // Track scroll for page indicator, resume, and pre-rendering
        recyclerView.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(@NonNull RecyclerView rv, int dx, int dy) {
                updatePageIndicator();
                prerenderAdjacentPages();
            }
        });
        
        // Post initial indicator update after layout to guarantee firstVisible is valid
        recyclerView.post(this::updatePageIndicator);
    }
    
    /**
     * Pre-render pages above and below viewport for smooth scrolling.
     */
    private void prerenderAdjacentPages() {
        if (adapter == null || pdfRenderer == null || renderExecutor == null) return;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int first = layoutManager.findFirstVisibleItemPosition();
        int last = layoutManager.findLastVisibleItemPosition();
        int total = pdfRenderer.getPageCount();
        
        // Pre-render PRERENDER_PAGES above and below
        for (int i = Math.max(0, first - PRERENDER_PAGES); i <= Math.min(total - 1, last + PRERENDER_PAGES); i++) {
            String cacheKey = getCacheKey(i, currentZoom, false);
            if (bitmapCache.get(cacheKey) == null && !pendingRenders.contains(cacheKey)) {
                final int pageIndex = i;
                pendingRenders.add(cacheKey);
                renderExecutor.execute(() -> renderPageAsync(pageIndex, currentZoom, false));
            }
        }
    }
    
    private void updatePageIndicator() {
        if (pdfRenderer == null || pageIndicator == null) return;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int firstVisible = layoutManager.findFirstVisibleItemPosition();
        int totalPages = pdfRenderer.getPageCount();
        
        if (firstVisible >= 0) {
            pageIndicator.setText(String.format(Locale.US, "%d / %d", firstVisible + 1, totalPages));
        }
    }
    
    private void applyZoom() {
        if (adapter != null) {
            adapter.notifyDataSetChanged();
        }
    }
    
    private void showTopBar() {
        if (topBar != null) {
            topBar.setVisibility(View.VISIBLE);
            topBar.animate().alpha(1f).setDuration(200).start();
            isTopBarVisible = true;
        }
    }
    
    private void hideTopBar() {
        if (topBar != null) {
            topBar.animate().alpha(0f).setDuration(200).withEndAction(() -> {
                if (topBar != null) topBar.setVisibility(View.GONE);
            }).start();
            isTopBarVisible = false;
        }
    }
    
    private void toggleTopBar() {
        if (isTopBarVisible) {
            hideTopBar();
        } else {
            showTopBar();
            scheduleHide();
        }
    }
    
    private void scheduleHide() {
        hideHandler.removeCallbacks(hideRunnable);
        hideHandler.postDelayed(hideRunnable, AUTO_HIDE_DELAY_MS);
    }
    
    private void exitViewer() {
        saveResumeState();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask();
        } else {
            finish();
        }
    }
    
    /**
     * Load pixel-accurate resume state from SharedPreferences.
     * 
     * We store:
     * - Page index (which page user was on)
     * - Pixel offset (how far into that page, can be negative)
     * - Scroll fraction (fallback for screen size changes: 0.0-1.0)
     * - Zoom level
     * - Screen width at save time (to detect screen size changes)
     */
    private void loadResumeState() {
        if (shortcutId == null) return;
        
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String key = shortcutId;
        
        resumePageIndex = prefs.getInt(key + "_page", 0);
        resumePixelOffset = prefs.getInt(key + "_offset", 0);
        resumeScrollFraction = prefs.getFloat(key + "_fraction", 0f);
        resumeZoom = prefs.getFloat(key + "_zoom", 1.0f);
        
        // Detect if screen size changed significantly (orientation, different device)
        int savedScreenWidth = prefs.getInt(key + "_screenWidth", 0);
        if (savedScreenWidth > 0 && Math.abs(savedScreenWidth - screenWidth) > 50) {
            // Screen size changed - use fraction-based restore instead of pixel offset
            Log.d(TAG, "Screen size changed (" + savedScreenWidth + " -> " + screenWidth + "), using fraction-based restore");
            resumePixelOffset = Integer.MIN_VALUE; // Signal to use fraction
        }
        
        Log.d(TAG, "Loaded resume state: page=" + resumePageIndex + 
              ", offset=" + resumePixelOffset + ", fraction=" + resumeScrollFraction + 
              ", zoom=" + resumeZoom);
    }
    
    /**
     * Save pixel-accurate resume state to SharedPreferences.
     * 
     * Captures:
     * - First visible page index
     * - Pixel offset of that page from RecyclerView top (can be negative = partially scrolled)
     * - Scroll fraction (for cross-device compatibility)
     * - Current zoom level
     * - Screen width (to detect orientation/device changes)
     */
    private void saveResumeState() {
        if (shortcutId == null || !resumeEnabled) return;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int firstVisiblePage = layoutManager.findFirstVisibleItemPosition();
        if (firstVisiblePage < 0) return;
        
        // Get the first visible view to calculate its offset from RecyclerView top
        View firstVisibleView = layoutManager.findViewByPosition(firstVisiblePage);
        if (firstVisibleView == null) return;
        
        // Pixel offset: how far the view's top is from RecyclerView's top
        // Negative = view has been scrolled past (top is above viewport)
        int pixelOffset = firstVisibleView.getTop();
        
        // Calculate scroll fraction for fallback (0.0 = top of page, 1.0 = bottom)
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
    
    /**
     * Restore reading position with pixel accuracy.
     * 
     * Uses scrollToPositionWithOffset for exact pixel positioning.
     * Falls back to fraction-based positioning if screen size changed.
     */
    private void restoreResumePosition() {
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        if (resumePixelOffset == Integer.MIN_VALUE) {
            // Screen size changed - use fraction-based restore
            // First scroll to page, then adjust by fraction after layout
            layoutManager.scrollToPositionWithOffset(resumePageIndex, 0);
            
            // Post a delayed adjustment based on fraction
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
            // Normal pixel-accurate restore
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
    
    /**
     * Find a fallback bitmap from a different zoom level for this page.
     * Used to avoid white flashes when current zoom bitmaps aren't ready.
     * 
     * CACHE STRATEGY: Look for ANY cached bitmap for this page.
     * The visual system will scale it (slightly blurry but better than white).
     * LRU will naturally evict old bitmaps as memory fills.
     * 
     * Priority: previous zoom high-res → previous zoom low-res → 1.0x high-res → 1.0x low-res
     */
    private Bitmap findFallbackBitmap(int pageIndex) {
        // Try previous zoom level first (most likely to exist after zoom change)
        if (previousZoom != currentZoom) {
            Bitmap fallback = bitmapCache.get(getCacheKey(pageIndex, previousZoom, false));
            if (fallback != null) return fallback;
            
            fallback = bitmapCache.get(getCacheKey(pageIndex, previousZoom, true));
            if (fallback != null) return fallback;
        }
        
        // Try 1.0x zoom (common baseline)
        if (currentZoom != 1.0f && previousZoom != 1.0f) {
            Bitmap fallback = bitmapCache.get(getCacheKey(pageIndex, 1.0f, false));
            if (fallback != null) return fallback;
            
            fallback = bitmapCache.get(getCacheKey(pageIndex, 1.0f, true));
            if (fallback != null) return fallback;
        }
        
        return null;
    }
    
    /**
     * Get cached page height scaled for current zoom.
     * Uses pre-cached dimensions to avoid synchronous PDF access.
     */
    private int getScaledPageHeight(int pageIndex) {
        if (pageWidths == null || pageIndex < 0 || pageIndex >= pageWidths.length) {
            return screenHeight / 2; // Fallback
        }
        float scale = (float) screenWidth / pageWidths[pageIndex] * currentZoom;
        return (int) (pageHeights[pageIndex] * scale);
    }
    
    /**
     * Render a page asynchronously with low-res → high-res atomic swap.
     * IMPORTANT: This method is already called from renderExecutor, do NOT wrap in another executor.
     */
    private void renderPageAsync(int pageIndex, float targetZoom, boolean lowResOnly) {
        final int generation = renderGeneration.get();
        final long startTime = System.currentTimeMillis();
        
        try {
            // Check if this render is still valid
            if (renderGeneration.get() != generation) {
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            // Use cached dimensions instead of opening page just for size
            if (pageWidths == null || pageIndex < 0 || pageIndex >= pageWidths.length) {
                crashLogger.logWarning("PdfViewer", "Invalid page index: " + pageIndex + 
                    ", pageWidths=" + (pageWidths != null ? pageWidths.length : "null"));
                Log.e(TAG, "Invalid page index or dimensions not cached: " + pageIndex);
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            int pageWidth = pageWidths[pageIndex];
            int pageHeight = pageHeights[pageIndex];
            
            // Calculate base scale to fit screen width
            float baseScale = (float) screenWidth / pageWidth;
            
            // --- Low-res pass (instant preview) ---
            float lowScale = baseScale * targetZoom * LOW_RES_SCALE;
            int lowWidth = Math.max(1, (int) (pageWidth * lowScale));
            int lowHeight = Math.max(1, (int) (pageHeight * lowScale));
            
            // CRITICAL FIX: Use ARGB_8888 - PdfRenderer requires ARGB format
            // Android docs: "The destination bitmap format must be ARGB"
            // RGB_565 causes silent render failures on many devices
            Bitmap lowBitmap = Bitmap.createBitmap(lowWidth, lowHeight, Bitmap.Config.ARGB_8888);
            lowBitmap.eraseColor(Color.WHITE);
            
            Log.d(TAG, "Rendering page " + pageIndex + " low-res: " + lowWidth + "x" + lowHeight + " ARGB_8888");
            
            // Now open page for actual rendering
            // CRITICAL FIX: Capture local reference to pdfRenderer before synchronized block
            // This prevents NullPointerException if pdfRenderer becomes null during onDestroy()
            // while this background thread is waiting or executing
            boolean lowResSuccess = false;
            PdfRenderer localRenderer = pdfRenderer;
            if (localRenderer == null) {
                lowBitmap.recycle();
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            synchronized (localRenderer) {
                // Double-check inside synchronized block (pdfRenderer could have been nulled)
                if (pdfRenderer == null || pageIndex < 0 || pageIndex >= localRenderer.getPageCount()) {
                    lowBitmap.recycle();
                    pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                    return;
                }
                
                try {
                    PdfRenderer.Page page = localRenderer.openPage(pageIndex);
                    
                    // Pass null for Matrix - PdfRenderer auto-scales to bitmap dimensions
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
            
            // Cache low-res
            String lowKey = getCacheKey(pageIndex, targetZoom, true);
            bitmapCache.put(lowKey, lowBitmap);
            
            // Post low-res to UI immediately
            final int finalHeight = (int) (pageHeight * baseScale * targetZoom);
            mainHandler.post(() -> {
                if (renderGeneration.get() == generation) {
                    adapter.updatePageBitmap(pageIndex, lowBitmap, finalHeight, true);
                }
            });
            
            if (lowResOnly) {
                return;
            }
            
            // Check again if still valid before expensive high-res render
            if (renderGeneration.get() != generation) {
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            // --- High-res pass (full quality) ---
            float highScale = baseScale * targetZoom;
            int highWidth = Math.max(1, (int) (pageWidth * highScale));
            int highHeight = Math.max(1, (int) (pageHeight * highScale));
            
            // Use ARGB_8888 for high quality
            Bitmap highBitmap = Bitmap.createBitmap(highWidth, highHeight, Bitmap.Config.ARGB_8888);
            highBitmap.eraseColor(Color.WHITE);
            
            // CRITICAL FIX: Re-capture local reference for high-res pass (could have changed)
            localRenderer = pdfRenderer;
            if (localRenderer == null) {
                highBitmap.recycle();
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            synchronized (localRenderer) {
                // Double-check inside synchronized block
                if (pdfRenderer == null || pageIndex < 0 || pageIndex >= localRenderer.getPageCount()) {
                    highBitmap.recycle();
                    pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                    return;
                }
                
                PdfRenderer.Page page = localRenderer.openPage(pageIndex);
                
                // CRITICAL FIX: Pass null for Matrix - PdfRenderer auto-scales to bitmap dimensions
                // The bitmap is already sized to highWidth x highHeight, so no Matrix needed
                page.render(highBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                
                page.close();
            }
            
            // Cache high-res
            String highKey = getCacheKey(pageIndex, targetZoom, false);
            bitmapCache.put(highKey, highBitmap);
            pendingRenders.remove(highKey);
            
            // Atomic swap: post high-res to UI
            mainHandler.post(() -> {
                if (renderGeneration.get() == generation) {
                    adapter.updatePageBitmap(pageIndex, highBitmap, finalHeight, false);
                }
            });
        } catch (OutOfMemoryError oom) {
            // Critical: OOM during bitmap creation
            crashLogger.recordError("PdfViewer", "renderPageAsync", oom,
                "pageIndex", String.valueOf(pageIndex),
                "targetZoom", String.valueOf(targetZoom),
                "lowResOnly", String.valueOf(lowResOnly));
            Log.e(TAG, "OOM rendering page " + pageIndex, oom);
            pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
            
            // Try to recover by clearing cache
            if (bitmapCache != null) {
                bitmapCache.evictAll();
            }
        } catch (Exception e) {
            crashLogger.recordError("PdfViewer", "renderPageAsync", e,
                "pageIndex", String.valueOf(pageIndex),
                "targetZoom", String.valueOf(targetZoom),
                "lowResOnly", String.valueOf(lowResOnly),
                "renderTime", String.valueOf(System.currentTimeMillis() - startTime));
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
        
        // Cancel any running zoom animation
        if (doubleTapAnimator != null && doubleTapAnimator.isRunning()) {
            doubleTapAnimator.cancel();
        }
        doubleTapAnimator = null;
        
        // CRITICAL: Capture and null references BEFORE shutting down executor
        // This signals background threads to exit gracefully and prevents
        // race conditions where threads try to use closed resources
        PdfRenderer rendererToClose = pdfRenderer;
        ParcelFileDescriptor fdToClose = fileDescriptor;
        pdfRenderer = null;      // Signal threads to exit
        fileDescriptor = null;
        
        // Shutdown executor and wait briefly for threads to finish
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
            renderExecutor = null;  // Prevent further use
        }
        
        // Evict bitmaps
        if (bitmapCache != null) {
            bitmapCache.evictAll();
        }
        
        // Now safe to close PDF resources (threads have exited)
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
    
    /**
     * RecyclerView adapter for PDF pages.
     * Implements low-res → high-res atomic swap for zero-blur zooming.
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
            imageView.setBackgroundColor(0xFFFFFFFF); // White page background
            return new PageViewHolder(imageView);
        }
        
        @Override
        public void onBindViewHolder(@NonNull PageViewHolder holder, int position) {
            holder.pageIndex = position;
            
            // Set height from cached dimensions (no synchronous PDF access)
            int height = getScaledPageHeight(position);
            ViewGroup.LayoutParams params = holder.imageView.getLayoutParams();
            params.height = height;
            holder.imageView.setLayoutParams(params);
            
            // CACHE STRATEGY: Multi-level fallback to avoid white flashes
            // Priority: current high-res → current low-res → previous high-res → previous low-res → white
            
            String highKey = getCacheKey(position, currentZoom, false);
            String lowKey = getCacheKey(position, currentZoom, true);
            
            Bitmap cached = bitmapCache.get(highKey);
            if (cached != null) {
                // Best case: high-res at current zoom
                holder.imageView.setImageBitmap(cached);
                return;
            }
            
            cached = bitmapCache.get(lowKey);
            if (cached != null) {
                // Good: low-res at current zoom
                holder.imageView.setImageBitmap(cached);
            } else {
                // Fallback: try previous zoom level (avoids white flash during zoom transition)
                // This bitmap will be visually scaled but better than white
                Bitmap fallback = findFallbackBitmap(position);
                if (fallback != null) {
                    holder.imageView.setImageBitmap(fallback);
                } else {
                    // Last resort: white placeholder
                    holder.imageView.setImageBitmap(null);
                    holder.imageView.setBackgroundColor(0xFFFFFFFF);
                }
            }
            
            // Trigger render if not already pending (with null guard for executor)
            if (!pendingRenders.contains(highKey) && renderExecutor != null) {
                pendingRenders.add(highKey);
                renderExecutor.execute(() -> renderPageAsync(position, currentZoom, false));
            }
        }
        
        /**
         * Update a specific page with a new bitmap (atomic swap).
         * 
         * CRITICAL FIX: When a page is in pendingZoomSwap, we perform an ATOMIC swap:
         * 1. Set the new high-res bitmap
         * 2. Reset visual scale to 1.0
         * 3. Update layout height
         * All in the SAME frame - no intermediate state visible to user.
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
                    
                    // Check if this page is awaiting atomic zoom swap
                    boolean needsAtomicSwap = pendingZoomSwap.contains(pageIndex) && !isLowRes;
                    
                    // Only update if we're upgrading (low→high) or this is first render
                    Bitmap current = null;
                    if (imageView.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
                        current = ((android.graphics.drawable.BitmapDrawable) imageView.getDrawable()).getBitmap();
                    }
                    
                    String highKey = getCacheKey(pageIndex, currentZoom, false);
                    boolean shouldUpdate = !isLowRes || current == null || bitmapCache.get(highKey) == null;
                    
                    if (shouldUpdate) {
                        // ATOMIC SWAP: Set bitmap AND reset scale in the same frame
                        imageView.setImageBitmap(bitmap);
                        
                        if (needsAtomicSwap) {
                            // Reset scale now that we have the correctly-sized bitmap
                            imageView.setScaleX(1f);
                            imageView.setScaleY(1f);
                            imageView.setPivotX(imageView.getWidth() / 2f);
                            imageView.setPivotY(imageView.getHeight() / 2f);
                            
                            // Remove from pending set
                            pendingZoomSwap.remove(pageIndex);
                            
                            // If all pending swaps complete, reset tracking state
                            if (pendingZoomSwap.isEmpty()) {
                                pendingVisualScale = 1.0f;
                            }
                        }
                        
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
            // Reset scale when recycled
            holder.imageView.setScaleX(1f);
            holder.imageView.setScaleY(1f);
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
