package app.onetap.shortcuts;

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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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
    private static final int AUTO_HIDE_DELAY_MS = 3000;
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
    private final Set<String> pendingRenders = new HashSet<>();
    
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
    
    // Resume state
    private String shortcutId;
    private boolean resumeEnabled = true;
    private int resumeScrollPosition = 0;
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
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
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
        
        if (pdfUri == null) {
            Log.e(TAG, "No PDF URI provided");
            finish();
            return;
        }
        
        Log.d(TAG, "Opening PDF: " + pdfUri + ", shortcutId=" + shortcutId + ", resume=" + resumeEnabled);
        
        // Initialize render executor (3 threads: 1 for low-res, 2 for high-res)
        renderExecutor = Executors.newFixedThreadPool(3);
        
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
            finish();
            return;
        }
        
        // Setup adapter
        setupRecyclerView();
        
        // Restore resume position after layout
        if (resumeEnabled && resumeScrollPosition > 0) {
            recyclerView.post(() -> {
                recyclerView.scrollToPosition(resumeScrollPosition);
                Log.d(TAG, "Restored scroll position: " + resumeScrollPosition);
            });
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
        
        setContentView(root);
    }
    
    private void setupGestureDetectors() {
        // Scale gesture for pinch-to-zoom
        scaleGestureDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScaleBegin(ScaleGestureDetector detector) {
                isScaling = true;
                focalX = detector.getFocusX();
                focalY = detector.getFocusY();
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
                // Commit zoom and trigger high-res re-render
                currentZoom = pendingZoom;
                invalidateCacheAndRerender();
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
                // Toggle between fit and 2.5x zoom
                if (currentZoom > 1.5f) {
                    currentZoom = 1.0f;
                } else {
                    currentZoom = DOUBLE_TAP_ZOOM;
                    focalX = e.getX();
                    focalY = e.getY();
                }
                pendingZoom = currentZoom;
                invalidateCacheAndRerender();
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
     */
    private void applyVisualZoom() {
        if (adapter == null) return;
        
        float scaleFactor = pendingZoom / currentZoom;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int first = layoutManager.findFirstVisibleItemPosition();
        int last = layoutManager.findLastVisibleItemPosition();
        
        for (int i = first; i <= last; i++) {
            View child = layoutManager.findViewByPosition(i);
            if (child instanceof ImageView) {
                child.setScaleX(scaleFactor);
                child.setScaleY(scaleFactor);
                child.setPivotX(focalX);
                child.setPivotY(focalY);
            }
        }
    }
    
    /**
     * Invalidate cache and trigger full re-render at new zoom level.
     * Called after zoom gesture ends.
     */
    private void invalidateCacheAndRerender() {
        // Increment generation to invalidate pending renders
        renderGeneration.incrementAndGet();
        
        // Clear cache for current zoom (keeps other zoom levels cached)
        // In practice, just clear everything for simplicity
        bitmapCache.evictAll();
        pendingRenders.clear();
        
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
        try {
            fileDescriptor = getContentResolver().openFileDescriptor(uri, "r");
            if (fileDescriptor == null) {
                Log.e(TAG, "Failed to open file descriptor");
                return false;
            }
            
            pdfRenderer = new PdfRenderer(fileDescriptor);
            int pageCount = pdfRenderer.getPageCount();
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
            Log.d(TAG, "Cached dimensions for " + pageCount + " pages");
            
            return true;
            
        } catch (IOException e) {
            Log.e(TAG, "Failed to open PDF: " + e.getMessage());
            return false;
        } catch (SecurityException e) {
            Log.e(TAG, "Security exception opening PDF: " + e.getMessage());
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
        
        updatePageIndicator();
    }
    
    /**
     * Pre-render pages above and below viewport for smooth scrolling.
     */
    private void prerenderAdjacentPages() {
        if (adapter == null || pdfRenderer == null) return;
        
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
    
    private void loadResumeState() {
        if (shortcutId == null) return;
        
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String key = shortcutId;
        
        resumeScrollPosition = prefs.getInt(key + "_scroll", 0);
        resumeZoom = prefs.getFloat(key + "_zoom", 1.0f);
        
        Log.d(TAG, "Loaded resume state: scroll=" + resumeScrollPosition + ", zoom=" + resumeZoom);
    }
    
    private void saveResumeState() {
        if (shortcutId == null || !resumeEnabled) return;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int scrollPosition = layoutManager.findFirstVisibleItemPosition();
        
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putInt(shortcutId + "_scroll", scrollPosition)
            .putFloat(shortcutId + "_zoom", currentZoom)
            .putLong(shortcutId + "_timestamp", System.currentTimeMillis())
            .apply();
        
        Log.d(TAG, "Saved resume state: scroll=" + scrollPosition + ", zoom=" + currentZoom);
    }
    
    private int dpToPx(int dp) {
        return (int) (dp * density + 0.5f);
    }
    
    private String getCacheKey(int pageIndex, float zoom, boolean lowRes) {
        return pageIndex + "_" + String.format(Locale.US, "%.2f", zoom) + (lowRes ? "_low" : "_high");
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
        
        try {
            // Check if this render is still valid
            if (renderGeneration.get() != generation) {
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            // Use cached dimensions instead of opening page just for size
            if (pageWidths == null || pageIndex < 0 || pageIndex >= pageWidths.length) {
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
            
            Bitmap lowBitmap = Bitmap.createBitmap(lowWidth, lowHeight, Bitmap.Config.RGB_565);
            lowBitmap.eraseColor(Color.WHITE);
            
            // Now open page for actual rendering
            synchronized (pdfRenderer) {
                if (pdfRenderer == null || pageIndex < 0 || pageIndex >= pdfRenderer.getPageCount()) {
                    lowBitmap.recycle();
                    pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                    return;
                }
                
                PdfRenderer.Page page = pdfRenderer.openPage(pageIndex);
                
                // CRITICAL FIX: Pass null for Matrix - PdfRenderer auto-scales to bitmap dimensions
                // The bitmap is already sized to lowWidth x lowHeight, so no Matrix needed
                page.render(lowBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                
                page.close();
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
            
            synchronized (pdfRenderer) {
                if (pdfRenderer == null || pageIndex < 0 || pageIndex >= pdfRenderer.getPageCount()) {
                    highBitmap.recycle();
                    pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                    return;
                }
                
                PdfRenderer.Page page = pdfRenderer.openPage(pageIndex);
                
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
        } catch (Exception e) {
            Log.e(TAG, "Failed to render page " + pageIndex + ": " + e.getMessage());
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
        hideHandler.removeCallbacks(hideRunnable);
        
        if (renderExecutor != null) {
            renderExecutor.shutdownNow();
        }
        
        if (bitmapCache != null) {
            bitmapCache.evictAll();
        }
        
        if (pdfRenderer != null) {
            try {
                pdfRenderer.close();
            } catch (Exception ignored) {}
        }
        
        if (fileDescriptor != null) {
            try {
                fileDescriptor.close();
            } catch (Exception ignored) {}
        }
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
            
            // Check cache first
            String highKey = getCacheKey(position, currentZoom, false);
            String lowKey = getCacheKey(position, currentZoom, true);
            
            Bitmap cached = bitmapCache.get(highKey);
            if (cached != null) {
                // High-res cached, use immediately
                holder.imageView.setImageBitmap(cached);
                return;
            }
            
            cached = bitmapCache.get(lowKey);
            if (cached != null) {
                // Low-res cached, use while waiting for high-res
                holder.imageView.setImageBitmap(cached);
            } else {
                // Show placeholder while loading
                holder.imageView.setImageBitmap(null);
                holder.imageView.setBackgroundColor(0xFFF5F5F5); // Light gray placeholder
            }
            
            // Trigger render if not already pending
            if (!pendingRenders.contains(highKey)) {
                pendingRenders.add(highKey);
                renderExecutor.execute(() -> renderPageAsync(position, currentZoom, false));
            }
        }
        
        /**
         * Update a specific page with a new bitmap (atomic swap).
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
                    
                    // Only update if we're upgrading (low→high) or this is first render
                    Bitmap current = null;
                    if (imageView.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
                        current = ((android.graphics.drawable.BitmapDrawable) imageView.getDrawable()).getBitmap();
                    }
                    
                    // Skip if we already have high-res
                    String highKey = getCacheKey(pageIndex, currentZoom, false);
                    if (!isLowRes || current == null || bitmapCache.get(highKey) == null) {
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
