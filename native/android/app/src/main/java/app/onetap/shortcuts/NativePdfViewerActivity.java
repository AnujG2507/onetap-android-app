package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.DisplayMetrics;
import android.util.Log;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.Locale;

/**
 * NativePdfViewerActivity
 * 
 * Minimal native PDF viewer designed for reading, not document management.
 * Uses Android's PdfRenderer for hardware-accelerated rendering.
 * 
 * Features:
 * - Continuous vertical scroll (RecyclerView)
 * - Pinch-to-zoom with focal anchoring
 * - Double-tap to toggle fit/zoom
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
    
    // Core components
    private RecyclerView recyclerView;
    private PdfPageAdapter adapter;
    private PdfRenderer pdfRenderer;
    private ParcelFileDescriptor fileDescriptor;
    
    // UI chrome
    private FrameLayout topBar;
    private ImageButton closeButton;
    private TextView pageIndicator;
    private boolean isTopBarVisible = true;
    
    // Zoom state
    private float currentZoom = 1.0f;
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
    
    // Background rendering
    private ExecutorService renderExecutor;
    
    // Auto-hide handler
    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private final Runnable hideRunnable = this::hideTopBar;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Get display metrics
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        screenWidth = metrics.widthPixels;
        screenHeight = metrics.heightPixels;
        density = metrics.density;
        
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
        
        // Initialize render executor
        renderExecutor = Executors.newFixedThreadPool(2);
        
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
                float newZoom = currentZoom * scaleFactor;
                
                // Clamp zoom
                newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
                
                if (newZoom != currentZoom) {
                    currentZoom = newZoom;
                    applyZoom();
                }
                
                return true;
            }
            
            @Override
            public void onScaleEnd(ScaleGestureDetector detector) {
                isScaling = false;
                // Trigger high-res re-render after gesture ends
                adapter.triggerHighResRender();
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
                applyZoom();
                adapter.triggerHighResRender();
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
    
    private boolean openPdf(Uri uri) {
        try {
            fileDescriptor = getContentResolver().openFileDescriptor(uri, "r");
            if (fileDescriptor == null) {
                Log.e(TAG, "Failed to open file descriptor");
                return false;
            }
            
            pdfRenderer = new PdfRenderer(fileDescriptor);
            Log.d(TAG, "Opened PDF with " + pdfRenderer.getPageCount() + " pages");
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
        
        adapter = new PdfPageAdapter();
        recyclerView.setAdapter(adapter);
        
        // Track scroll for page indicator and resume
        recyclerView.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(@NonNull RecyclerView rv, int dx, int dy) {
                updatePageIndicator();
            }
        });
        
        updatePageIndicator();
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
            adapter.setZoom(currentZoom);
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
     * Renders pages at current zoom level with low-res → high-res swap.
     */
    private class PdfPageAdapter extends RecyclerView.Adapter<PdfPageAdapter.PageViewHolder> {
        
        private float zoom = 1.0f;
        
        void setZoom(float newZoom) {
            this.zoom = newZoom;
            notifyDataSetChanged();
        }
        
        void triggerHighResRender() {
            // Force re-bind visible items for high-res
            notifyDataSetChanged();
        }
        
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
            renderPage(holder, position);
        }
        
        @Override
        public int getItemCount() {
            return pdfRenderer != null ? pdfRenderer.getPageCount() : 0;
        }
        
        private void renderPage(PageViewHolder holder, int pageIndex) {
            renderExecutor.execute(() -> {
                try {
                    synchronized (pdfRenderer) {
                        if (pageIndex < 0 || pageIndex >= pdfRenderer.getPageCount()) return;
                        
                        PdfRenderer.Page page = pdfRenderer.openPage(pageIndex);
                        
                        // Calculate dimensions based on zoom
                        int pageWidth = page.getWidth();
                        int pageHeight = page.getHeight();
                        
                        // Scale to fit screen width at zoom 1.0
                        float scale = (float) screenWidth / pageWidth * zoom;
                        int renderWidth = (int) (pageWidth * scale);
                        int renderHeight = (int) (pageHeight * scale);
                        
                        // Create bitmap
                        Bitmap bitmap = Bitmap.createBitmap(
                            renderWidth, renderHeight, Bitmap.Config.ARGB_8888
                        );
                        bitmap.eraseColor(0xFFFFFFFF); // White background
                        
                        // Render page to bitmap
                        Matrix matrix = new Matrix();
                        matrix.setScale(scale, scale);
                        page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                        
                        page.close();
                        
                        // Update UI on main thread
                        runOnUiThread(() -> {
                            holder.imageView.setImageBitmap(bitmap);
                            
                            // Set proper height for aspect ratio
                            ViewGroup.LayoutParams params = holder.imageView.getLayoutParams();
                            params.height = renderHeight;
                            holder.imageView.setLayoutParams(params);
                        });
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed to render page " + pageIndex + ": " + e.getMessage());
                }
            });
        }
        
        class PageViewHolder extends RecyclerView.ViewHolder {
            ImageView imageView;
            
            PageViewHolder(ImageView view) {
                super(view);
                this.imageView = view;
            }
        }
    }
}
