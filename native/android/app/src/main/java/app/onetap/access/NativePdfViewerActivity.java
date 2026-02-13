package app.onetap.access;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.pdf.PdfRenderer;
import android.content.res.Configuration;
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
import android.view.VelocityTracker;
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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.drawable.GradientDrawable;
import android.view.ViewOutlineProvider;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

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
 * - Fast scroll with page indicator for large documents
 * - Dynamic layout heights when zoomed out (train view)
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
    
    // Maximum bitmap memory in bytes (~100MB for ARGB_8888 = ~25 million pixels)
    // This prevents Canvas "too large bitmap" crashes on high zoom
    private static final long MAX_BITMAP_BYTES = 100 * 1024 * 1024;
    private static final int MAX_BITMAP_DIMENSION = 4096; // Hardware texture limit on most devices
    private static final float FIT_PAGE_ZOOM = 1.0f;  // Default fit-to-width
    
    // Pre-render pages above/below viewport for smooth scrolling
    // Increased from 2 to 5 for smoother scrolling with train view
    private static final int PRERENDER_PAGES = 5;
    
    // Low-res scale factor for instant preview (0.5x = half resolution)
    private static final float LOW_RES_SCALE = 0.5f;
    
    // Page gap in dp (reduced from 8 for Drive-like appearance)
    private static final int PAGE_GAP_DP = 4;
    
    // Page elevation for card-like shadow effect
    private static final int PAGE_ELEVATION_DP = 2;
    
    // Scroll threshold for header show/hide (in pixels)
    private static final int SCROLL_THRESHOLD = 20;
    
    // Fast scroll constants
    private static final int FAST_SCROLL_THUMB_WIDTH_DP = 6;
    private static final int FAST_SCROLL_THUMB_MIN_HEIGHT_DP = 48;
    private static final int FAST_SCROLL_TOUCH_WIDTH_DP = 44;
    private static final int FAST_SCROLL_AUTO_HIDE_MS = 1500;
    private static final int FAST_SCROLL_POPUP_MARGIN_DP = 56;
    
    // NOTE: LAYOUT_UPDATE_THROTTLE_MS removed - no longer needed with canvas-based gesture scaling
    
    // Core components
    private ZoomableRecyclerView recyclerView;
    private PdfPageAdapter adapter;
    private PdfRenderer pdfRenderer;
    private ParcelFileDescriptor fileDescriptor;
    
    // Fast scroll overlay
    private FastScrollOverlay fastScrollOverlay;
    
    private int pageGapPx;
    
    // PDF URI and title for "Open with" feature
    private Uri pdfUri;
    private String pdfTitle;
    
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
    
    // UI chrome - premium header with content-aware layout
    private LinearLayout rootLayout;
    private FrameLayout headerSpace;
    private FrameLayout topBar;
    private ImageButton closeButton;
    private ImageButton openWithButton;
    private ValueAnimator headerAnimator;
    private int statusBarHeight = 0;
    private TextView pageIndicator;
    private boolean isTopBarVisible = true;
    
    // Zoom state (now managed by ZoomableRecyclerView for canvas-level zoom)
    private float currentZoom = 1.0f;
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
    
    // NOTE: lastLayoutUpdateTime removed - no longer needed with canvas-based gesture scaling
    
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
    /**
     * Callback interface for scale events from ZoomableRecyclerView.
     */
    private interface ScaleCallback {
        void onScaleBegin(float startZoom);
        void onScale(float newZoom, float fx, float fy);
        void onScaleEnd(float finalZoom);
        void onSingleTapConfirmed();
        void onDoubleTap(float x, float y);
    }
    
    /**
     * Custom RecyclerView that applies canvas-level zoom transformation.
     * 
     * This approach (used by Google Drive) ensures:
     * - All children scale uniformly without overlapping
     * - RecyclerView layout remains stable during zoom
     * - Horizontal panning works when zoomed in
     * - No per-child scale manipulation needed
     * 
     * CRITICAL: Gesture detectors are initialized INSIDE this class and handled
     * in onTouchEvent() BEFORE calling super. This prevents the race condition
     * where RecyclerView starts scrolling before the scale gesture is recognized.
     */
    private class ZoomableRecyclerView extends RecyclerView {
        private float zoomLevel = 1.0f;
        private float panX = 0f;
        private float panY = 0f;  // Vertical pan for zoomed-in mode
        private float focalX = 0f;
        private float focalY = 0f;
        
        // Zoom state during gesture
        private float pendingZoom = 1.0f;
        private float gestureStartZoom = 1.0f;
        
        // Internal gesture detectors (MUST be inside RecyclerView to fix race condition)
        private ScaleGestureDetector internalScaleDetector;
        private GestureDetector internalGestureDetector;
        
        // Scale mode flag - prevents scroll fling after pinch gesture ends
        private boolean inScaleMode = false;
        
        // Callback for activity-level state updates
        private ScaleCallback scaleCallback;
        
        // Track if scaling is in progress (for panning logic)
        private boolean isInternalScaling = false;
        
        // SMOOTH ZOOM: Track if a gesture/animation is active for canvas-only scaling
        // During gesture, use canvas scaling for ALL zoom levels (including < 1.0x)
        // This avoids layout flickering from frequent notifyDataSetChanged() calls
        private boolean isGestureActive = false;
        
        // The zoom level at which layouts were last committed (via notifyDataSetChanged)
        private float committedZoom = 1.0f;
        
        public ZoomableRecyclerView(Context context) {
            super(context);
            // Disable overscroll effect during pan
            setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
            initGestureDetectors();
        }
        
        /**
         * Set callback for scale events.
         */
        public void setScaleCallback(ScaleCallback callback) {
            this.scaleCallback = callback;
        }
        
        /**
         * Initialize gesture detectors INSIDE the RecyclerView.
         * This ensures gestures are processed before scroll logic.
         */
        private void initGestureDetectors() {
            // Scale gesture for pinch-to-zoom
            internalScaleDetector = new ScaleGestureDetector(getContext(), 
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    private float startZoom = 1.0f;
                    // CRITICAL: Track accumulated scale factor across frames
                    // getScaleFactor() returns the DELTA between frames, not from start
                    private float accumulatedScale = 1.0f;
                    
                    @Override
                    public boolean onScaleBegin(ScaleGestureDetector detector) {
                        isInternalScaling = true;
                        inScaleMode = true;
                        isGestureActive = true;  // SMOOTH ZOOM: Enable canvas-only scaling
                        // Prevent parent from intercepting touch during scale gesture
                        getParent().requestDisallowInterceptTouchEvent(true);
                        startZoom = zoomLevel;
                        accumulatedScale = 1.0f;  // Reset accumulator at gesture start
                        beginZoomGesture(detector.getFocusX(), detector.getFocusY());
                        
                        if (scaleCallback != null) {
                            scaleCallback.onScaleBegin(startZoom);
                        }
                        return true;
                    }
                    
                    @Override
                    public boolean onScale(ScaleGestureDetector detector) {
                        // CRITICAL: Accumulate scale factor across frames
                        // Each call to getScaleFactor() returns the delta from previous frame
                        accumulatedScale *= detector.getScaleFactor();
                        float newZoom = startZoom * accumulatedScale;
                        newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
                        
                        float fx = detector.getFocusX();
                        float fy = detector.getFocusY();
                        
                        // When zooming out below 1.0x, blend focal point toward screen center
                        // This prevents content from drifting off-screen (Google Drive behavior)
                        if (newZoom < 1.0f) {
                            float centerX = getWidth() / 2f;
                            float centerY = getHeight() / 2f;
                            // Blend factor: 0 at 1.0x, approaches 1 at MIN_ZOOM
                            float t = (1.0f - newZoom) / (1.0f - MIN_ZOOM);
                            t = Math.min(1.0f, t); // Clamp to 1.0
                            fx = fx + (centerX - fx) * t;
                            fy = fy + (centerY - fy) * t;
                            
                            // Reset pan when zooming out below 1.0x to ensure centering
                            panX = 0;
                            panY = 0;
                        }
                        
                        // Update both zoomLevel and pendingZoom to keep them in sync
                        pendingZoom = newZoom;
                        setZoom(newZoom, fx, fy);
                        
                        if (scaleCallback != null) {
                            scaleCallback.onScale(newZoom, fx, fy);
                        }
                        return true;
                    }
                    
                    @Override
                    public void onScaleEnd(ScaleGestureDetector detector) {
                        isInternalScaling = false;
                        isGestureActive = false;  // SMOOTH ZOOM: Disable canvas-only scaling
                        committedZoom = zoomLevel;  // SMOOTH ZOOM: Record committed zoom level
                        // NOTE: inScaleMode stays true until ACTION_UP to prevent scroll fling
                        
                        // Allow parent to intercept again
                        getParent().requestDisallowInterceptTouchEvent(false);
                        
                        // Don't call commitZoomGesture() - zoomLevel is already correct
                        // Just ensure pendingZoom matches for consistency
                        pendingZoom = zoomLevel;
                        
                        if (scaleCallback != null) {
                            scaleCallback.onScaleEnd(zoomLevel);
                        }
                    }
                });
            
            // Tap gesture for show/hide UI and double-tap zoom
            internalGestureDetector = new GestureDetector(getContext(), 
                new GestureDetector.SimpleOnGestureListener() {
                    @Override
                    public boolean onSingleTapConfirmed(MotionEvent e) {
                        if (scaleCallback != null) {
                            scaleCallback.onSingleTapConfirmed();
                        }
                        return true;
                    }
                    
                    @Override
                    public boolean onDoubleTap(MotionEvent e) {
                        if (scaleCallback != null) {
                            scaleCallback.onDoubleTap(e.getX(), e.getY());
                        }
                        return true;
                    }
                });
        }
        
        @Override
        protected void dispatchDraw(Canvas canvas) {
            canvas.save();
            
            if (isGestureActive) {
                // SMOOTH ZOOM: During gesture, apply DELTA scaling from committed state
                // This prevents the "squeeze" effect when starting gesture at zoomed-out state
                // Layouts are already scaled to committedZoom, so we only apply the difference
                float visualScale = zoomLevel / committedZoom;
                
                if (visualScale != 1.0f) {
                    float centerX = getWidth() / 2f;
                    float centerY = getHeight() / 2f;
                    
                    if (zoomLevel < 1.0f) {
                        // ZOOMING OUT: Scale from center, no pan
                        canvas.scale(visualScale, visualScale, centerX, centerY);
                    } else if (committedZoom < 1.0f) {
                        // TRANSITIONING from zoomed-out to zoomed-in during gesture
                        // Scale from center during this transition
                        canvas.scale(visualScale, visualScale, centerX, centerY);
                    } else {
                        // ZOOMING IN from >= 1.0x: Use focal point and pan
                        float scaledContentWidth = getWidth() * zoomLevel;
                        float effectivePanX = (scaledContentWidth > getWidth()) ? panX : 0;
                        canvas.translate(effectivePanX, panY);
                        canvas.scale(visualScale, visualScale, focalX, focalY);
                    }
                }
                // visualScale == 1.0f means no transform needed (gesture just started)
            } else if (committedZoom < 1.0f && zoomLevel < 1.0f) {
                // COMMITTED ZOOMED OUT: Layouts already scaled via notifyDataSetChanged
                // No canvas transform needed - pages are centered via Gravity.CENTER_HORIZONTAL
            } else if (zoomLevel > 1.0f) {
                // COMMITTED ZOOMED IN: Canvas-based pan + scale
                float scaledContentWidth = getWidth() * zoomLevel;
                float effectivePanX = (scaledContentWidth > getWidth()) ? panX : 0;
                
                canvas.translate(effectivePanX, panY);
                canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
            }
            // At 1.0x committed: No transformation needed
            
            super.dispatchDraw(canvas);
            canvas.restore();
        }
        
        @Override
        public boolean onInterceptTouchEvent(MotionEvent e) {
            // Don't intercept multi-touch events - let onTouchEvent handle scale detection
            if (e.getPointerCount() > 1) {
                return false;
            }
            
            // Intercept single-touch for horizontal panning when zoomed
            if (zoomLevel > 1.0f && e.getPointerCount() == 1) {
                return true;
            }
            return super.onInterceptTouchEvent(e);
        }
        
        private float lastTouchX = 0f;
        private float lastTouchY = 0f;  // Track Y for vertical panning
        private boolean isPanning = false;
        
        // Velocity tracking for fling physics
        private VelocityTracker velocityTracker;
        private ValueAnimator flingAnimator;
        private static final float FLING_FRICTION = 0.92f;  // Deceleration factor per frame
        private static final float MIN_FLING_VELOCITY = 50f;  // Minimum velocity to trigger fling
        
        @Override
        public boolean onTouchEvent(MotionEvent e) {
            // CRITICAL: Process gesture detectors FIRST, before any scroll handling
            // This fixes the race condition where RecyclerView starts scrolling
            // before the scale gesture is recognized
            internalScaleDetector.onTouchEvent(e);
            internalGestureDetector.onTouchEvent(e);
            
            int action = e.getActionMasked();
            
            // When second finger comes down, enter scale mode immediately
            if (action == MotionEvent.ACTION_POINTER_DOWN && e.getPointerCount() >= 2) {
                inScaleMode = true;
                getParent().requestDisallowInterceptTouchEvent(true);
            }
            
            // If scale detector is active OR we're in multi-touch, consume the event
            // This prevents RecyclerView from processing as scroll
            if (internalScaleDetector.isInProgress() || e.getPointerCount() > 1) {
                return true;  // Consume - no scroll
            }
            
            // If just exited scale mode, consume the final UP to prevent scroll fling
            if (inScaleMode && (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL)) {
                inScaleMode = false;
                getParent().requestDisallowInterceptTouchEvent(false);
                return true;  // Consume the final UP
            }
            
            // Handle bidirectional panning when zoomed in
            if (zoomLevel > 1.0f) {
                switch (action) {
                    case MotionEvent.ACTION_DOWN:
                        // Cancel any ongoing fling
                        if (flingAnimator != null && flingAnimator.isRunning()) {
                            flingAnimator.cancel();
                        }
                        
                        // Initialize velocity tracker
                        if (velocityTracker == null) {
                            velocityTracker = VelocityTracker.obtain();
                        } else {
                            velocityTracker.clear();
                        }
                        velocityTracker.addMovement(e);
                        
                        lastTouchX = e.getX();
                        lastTouchY = e.getY();
                        isPanning = false;
                        break;
                        
                    case MotionEvent.ACTION_MOVE:
                        if (velocityTracker != null) {
                            velocityTracker.addMovement(e);
                        }
                        
                        if (e.getPointerCount() == 1 && !isInternalScaling) {
                            float dx = e.getX() - lastTouchX;
                            float dy = e.getY() - lastTouchY;
                            
                            // Calculate scaled content dimensions
                            float scaledContentWidth = getWidth() * zoomLevel;
                            float scaledContentHeight = getHeight() * zoomLevel;
                            
                            // Start panning if movement exceeds threshold
                            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                                isPanning = true;
                            }
                            
                            if (isPanning) {
                                // Horizontal pan only if content wider than screen
                                if (scaledContentWidth > getWidth()) {
                                    panX = panX + dx;
                                }
                                
                                // Vertical pan only if zoomed in (content taller than viewport)
                                if (scaledContentHeight > getHeight()) {
                                    panY = panY + dy;
                                }
                                
                                clampPan();
                                lastTouchX = e.getX();
                                lastTouchY = e.getY();
                                invalidate();
                            }
                        }
                        break;
                        
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (isPanning && velocityTracker != null) {
                            // Compute velocity
                            velocityTracker.computeCurrentVelocity(1000);  // pixels per second
                            float vx = velocityTracker.getXVelocity();
                            float vy = velocityTracker.getYVelocity();
                            
                            // Start fling if velocity exceeds threshold
                            if (Math.abs(vx) > MIN_FLING_VELOCITY || Math.abs(vy) > MIN_FLING_VELOCITY) {
                                startFling(vx, vy);
                            }
                            
                            velocityTracker.recycle();
                            velocityTracker = null;
                            isPanning = false;
                            return true;
                        }
                        if (velocityTracker != null) {
                            velocityTracker.recycle();
                            velocityTracker = null;
                        }
                        break;
                }
            }
            
            // Allow normal RecyclerView scroll for single-touch when not in scale mode
            return super.onTouchEvent(e);
        }
        
        /**
         * Start fling animation with given initial velocities.
         * Uses friction-based deceleration for natural feel.
         */
        private void startFling(float velocityX, float velocityY) {
            if (flingAnimator != null && flingAnimator.isRunning()) {
                flingAnimator.cancel();
            }
            
            // Scale velocities for smoother feel (pixels/sec to pixels/frame at 60fps)
            final float[] vx = {velocityX / 60f};
            final float[] vy = {velocityY / 60f};
            
            flingAnimator = ValueAnimator.ofFloat(0f, 1f);
            flingAnimator.setDuration(2000);  // Max duration, will stop early when velocity dies
            flingAnimator.setInterpolator(new android.view.animation.LinearInterpolator());
            
            flingAnimator.addUpdateListener(animation -> {
                // Apply friction
                vx[0] *= FLING_FRICTION;
                vy[0] *= FLING_FRICTION;
                
                // Stop when velocity is negligible
                if (Math.abs(vx[0]) < 0.5f && Math.abs(vy[0]) < 0.5f) {
                    flingAnimator.cancel();
                    return;
                }
                
                // Calculate scaled content dimensions
                float scaledContentWidth = getWidth() * zoomLevel;
                float scaledContentHeight = getHeight() * zoomLevel;
                
                // Apply velocity to pan
                if (scaledContentWidth > getWidth()) {
                    panX += vx[0];
                }
                if (scaledContentHeight > getHeight()) {
                    panY += vy[0];
                }
                
                // Clamp and check for edge bounce
                float oldPanX = panX;
                float oldPanY = panY;
                clampPan();
                
                // If we hit an edge, dampen velocity in that direction
                if (panX != oldPanX + vx[0]) vx[0] = 0;
                if (panY != oldPanY + vy[0]) vy[0] = 0;
                
                invalidate();
            });
            
            flingAnimator.start();
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
        /**
         * Clamp pan to content bounds with smart centering.
         * When content fits within screen, center it (pan = 0).
         * When content exceeds screen, allow panning within bounds.
         */
        private void clampPan() {
            // Calculate scaled content dimensions
            float scaledContentWidth = getWidth() * zoomLevel;
            float scaledContentHeight = getHeight() * zoomLevel;
            
            // HORIZONTAL: If content fits, center it (panX = 0)
            // If content exceeds, allow panning within bounds
            if (scaledContentWidth <= getWidth() || zoomLevel <= 1.0f) {
                panX = 0;  // Center content
            } else {
                float maxPanX = (scaledContentWidth - getWidth()) / 2f;
                panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
            }
            
            // VERTICAL: No pan when zoomed out/at 1.0x
            // When zoomed in, clamp vertical pan based on content height
            if (zoomLevel <= 1.0f) {
                panY = 0;  // No vertical pan when zoomed out/at 1.0x
            } else {
                // Clamp vertical pan based on content height
                if (scaledContentHeight <= getHeight()) {
                    panY = 0;  // Content fits, center it
                } else {
                    float maxPanY = (scaledContentHeight - getHeight()) / 2f;
                    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
                }
            }
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
            this.panY = 0f;
            this.focalX = getWidth() / 2f;
            this.focalY = getHeight() / 2f;
            invalidate();
        }
        
        /**
         * Reset pan offsets (used during orientation changes).
         */
        public void resetPan() {
            this.panX = 0f;
            this.panY = 0f;
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
            
            // SMOOTH ZOOM: Enable canvas-only scaling during animation
            isGestureActive = true;
            
            final float startZoom = zoomLevel;
            final float startPanX = panX;
            final float startPanY = panY;
            final float startFocalX = focalX;
            final float startFocalY = focalY;
            
            // Target focal point is center when zooming to or below 1.0x
            final float targetFocalX = (targetZoom <= 1.0f) ? getWidth() / 2f : fx;
            final float targetFocalY = (targetZoom <= 1.0f) ? getHeight() / 2f : fy;
            // Reset pan to 0 when zooming to or below 1.0x
            final float targetPanX = (targetZoom <= 1.0f) ? 0 : panX;
            final float targetPanY = (targetZoom <= 1.0f) ? 0 : panY;
            
            doubleTapAnimator = ValueAnimator.ofFloat(0f, 1f);
            doubleTapAnimator.setDuration(DOUBLE_TAP_ANIM_DURATION_MS);
            doubleTapAnimator.setInterpolator(new DecelerateInterpolator(1.5f));
            
            doubleTapAnimator.addUpdateListener(animation -> {
                float progress = (float) animation.getAnimatedValue();
                zoomLevel = startZoom + (targetZoom - startZoom) * progress;
                panX = startPanX + (targetPanX - startPanX) * progress;
                panY = startPanY + (targetPanY - startPanY) * progress;
                focalX = startFocalX + (targetFocalX - startFocalX) * progress;
                focalY = startFocalY + (targetFocalY - startFocalY) * progress;
                clampPan();
                invalidate();
            });
            
            doubleTapAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(android.animation.Animator animation) {
                    // SMOOTH ZOOM: Commit changes after animation ends
                    isGestureActive = false;
                    committedZoom = targetZoom;
                    
                    zoomLevel = targetZoom;
                    if (targetZoom <= 1.0f) {
                        panX = 0;
                        panY = 0;
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
    
    /**
     * Fast scroll overlay for quick navigation through large documents.
     * Shows a draggable thumb on the right edge with page number popup.
     */
    private class FastScrollOverlay extends View {
        private Paint thumbPaint;
        private Paint trackPaint;
        private Paint popupBgPaint;
        private Paint popupTextPaint;
        
        private RectF thumbRect = new RectF();
        private RectF touchArea = new RectF();
        
        private boolean isDragging = false;
        private boolean isVisible = false;
        private float thumbAlpha = 0f;
        
        private int thumbWidth;
        private int thumbMinHeight;
        private int touchWidth;
        private int popupMargin;
        
        private String pageText = "";
        
        private ValueAnimator fadeAnimator;
        private final Handler hideHandler = new Handler(Looper.getMainLooper());
        private final Runnable hideRunnable = this::fadeOut;
        
        public FastScrollOverlay(Context context) {
            super(context);
            init();
        }
        
        private void init() {
            thumbWidth = dpToPx(FAST_SCROLL_THUMB_WIDTH_DP);
            thumbMinHeight = dpToPx(FAST_SCROLL_THUMB_MIN_HEIGHT_DP);
            touchWidth = dpToPx(FAST_SCROLL_TOUCH_WIDTH_DP);
            popupMargin = dpToPx(FAST_SCROLL_POPUP_MARGIN_DP);
            
            // Thumb paint - semi-transparent white
            thumbPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            thumbPaint.setColor(0xCCFFFFFF);
            thumbPaint.setStyle(Paint.Style.FILL);
            
            // Track paint - very subtle
            trackPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            trackPaint.setColor(0x33FFFFFF);
            trackPaint.setStyle(Paint.Style.FILL);
            
            // Popup background
            popupBgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            popupBgPaint.setColor(0xDD333333);
            popupBgPaint.setStyle(Paint.Style.FILL);
            
            // Popup text
            popupTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            popupTextPaint.setColor(0xFFFFFFFF);
            popupTextPaint.setTextSize(dpToPx(14));
            popupTextPaint.setTextAlign(Paint.Align.RIGHT);
        }
        
        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            
            if (thumbAlpha <= 0) return;
            
            int width = getWidth();
            int height = getHeight();
            
            // Apply alpha
            thumbPaint.setAlpha((int) (0xCC * thumbAlpha));
            trackPaint.setAlpha((int) (0x33 * thumbAlpha));
            
            // Draw track
            float trackLeft = width - thumbWidth - dpToPx(4);
            canvas.drawRoundRect(trackLeft, dpToPx(8), width - dpToPx(4), height - dpToPx(8), 
                    thumbWidth / 2f, thumbWidth / 2f, trackPaint);
            
            // Draw thumb
            canvas.drawRoundRect(thumbRect, thumbWidth / 2f, thumbWidth / 2f, thumbPaint);
            
            // Draw popup when dragging
            if (isDragging && pageText.length() > 0) {
                popupBgPaint.setAlpha((int) (0xDD * thumbAlpha));
                popupTextPaint.setAlpha((int) (0xFF * thumbAlpha));
                
                float textWidth = popupTextPaint.measureText(pageText);
                float popupPadding = dpToPx(12);
                float popupHeight = dpToPx(36);
                float popupLeft = thumbRect.left - popupMargin - textWidth - popupPadding * 2;
                float popupTop = thumbRect.centerY() - popupHeight / 2;
                float popupRight = thumbRect.left - popupMargin;
                float popupBottom = popupTop + popupHeight;
                
                // Clamp popup to screen
                if (popupTop < dpToPx(8)) {
                    popupTop = dpToPx(8);
                    popupBottom = popupTop + popupHeight;
                }
                if (popupBottom > height - dpToPx(8)) {
                    popupBottom = height - dpToPx(8);
                    popupTop = popupBottom - popupHeight;
                }
                
                RectF popupRect = new RectF(popupLeft, popupTop, popupRight, popupBottom);
                canvas.drawRoundRect(popupRect, dpToPx(4), dpToPx(4), popupBgPaint);
                
                // Draw text centered vertically in popup
                float textY = popupRect.centerY() + popupTextPaint.getTextSize() / 3;
                canvas.drawText(pageText, popupRight - popupPadding, textY, popupTextPaint);
            }
        }
        
        @Override
        public boolean onTouchEvent(MotionEvent event) {
            int action = event.getActionMasked();
            float x = event.getX();
            float y = event.getY();
            
            // Expand touch area for easier grabbing
            touchArea.set(thumbRect);
            touchArea.left = getWidth() - touchWidth;
            touchArea.top = Math.max(0, thumbRect.top - dpToPx(16));
            touchArea.bottom = Math.min(getHeight(), thumbRect.bottom + dpToPx(16));
            
            switch (action) {
                case MotionEvent.ACTION_DOWN:
                    if (touchArea.contains(x, y) || (x > getWidth() - touchWidth && isVisible)) {
                        isDragging = true;
                        getParent().requestDisallowInterceptTouchEvent(true);
                        scrollToPosition(y);
                        showImmediate();
                        return true;
                    }
                    return false;
                    
                case MotionEvent.ACTION_MOVE:
                    if (isDragging) {
                        scrollToPosition(y);
                        return true;
                    }
                    break;
                    
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (isDragging) {
                        isDragging = false;
                        getParent().requestDisallowInterceptTouchEvent(false);
                        scheduleHide();
                        invalidate();
                        return true;
                    }
                    break;
            }
            
            return super.onTouchEvent(event);
        }
        
        private void scrollToPosition(float y) {
            if (recyclerView == null || adapter == null) return;
            
            int totalPages = adapter.getItemCount();
            if (totalPages <= 0) return;
            
            // Calculate target page from touch position
            float scrollableHeight = getHeight() - thumbMinHeight;
            float fraction = (y - thumbMinHeight / 2f) / scrollableHeight;
            fraction = Math.max(0, Math.min(1, fraction));
            
            int targetPage = (int) (fraction * (totalPages - 1));
            targetPage = Math.max(0, Math.min(totalPages - 1, targetPage));
            
            // Update page text
            pageText = (targetPage + 1) + " / " + totalPages;
            
            // Scroll to target page
            LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
            if (layoutManager != null) {
                layoutManager.scrollToPositionWithOffset(targetPage, 0);
            }
            
            updateThumbPosition();
            invalidate();
        }
        
        /**
         * Update thumb position based on current scroll position.
         */
        public void updateThumbPosition() {
            if (recyclerView == null || adapter == null) return;
            
            int totalPages = adapter.getItemCount();
            if (totalPages <= 1) {
                thumbRect.setEmpty();
                return;
            }
            
            LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
            if (layoutManager == null) return;
            
            int firstVisible = layoutManager.findFirstVisibleItemPosition();
            int lastVisible = layoutManager.findLastVisibleItemPosition();
            
            if (firstVisible < 0) return;
            
            // Calculate scroll fraction
            View firstView = layoutManager.findViewByPosition(firstVisible);
            float scrollOffset = 0;
            if (firstView != null) {
                scrollOffset = -firstView.getTop() / (float) Math.max(1, firstView.getHeight());
            }
            
            float fraction = (firstVisible + scrollOffset) / (totalPages - 1);
            fraction = Math.max(0, Math.min(1, fraction));
            
            // Calculate thumb size based on visible fraction
            float visibleFraction = (float) (lastVisible - firstVisible + 1) / totalPages;
            int thumbHeight = (int) Math.max(thumbMinHeight, getHeight() * visibleFraction);
            
            // Calculate thumb position
            float scrollableHeight = getHeight() - thumbHeight;
            float thumbTop = fraction * scrollableHeight;
            
            int width = getWidth();
            thumbRect.set(
                    width - thumbWidth - dpToPx(4),
                    thumbTop,
                    width - dpToPx(4),
                    thumbTop + thumbHeight
            );
            
            // Update page text for current position
            if (!isDragging) {
                pageText = (firstVisible + 1) + " / " + totalPages;
            }
        }
        
        /**
         * Show the fast scroll thumb.
         */
        public void show() {
            if (adapter != null && adapter.getItemCount() <= 3) {
                return; // Don't show for small documents
            }
            
            isVisible = true;
            hideHandler.removeCallbacks(hideRunnable);
            
            if (fadeAnimator != null && fadeAnimator.isRunning()) {
                fadeAnimator.cancel();
            }
            
            fadeAnimator = ValueAnimator.ofFloat(thumbAlpha, 1f);
            fadeAnimator.setDuration(150);
            fadeAnimator.addUpdateListener(animation -> {
                thumbAlpha = (float) animation.getAnimatedValue();
                invalidate();
            });
            fadeAnimator.start();
            
            scheduleHide();
        }
        
        private void showImmediate() {
            isVisible = true;
            thumbAlpha = 1f;
            hideHandler.removeCallbacks(hideRunnable);
            invalidate();
        }
        
        private void fadeOut() {
            if (isDragging) return;
            
            if (fadeAnimator != null && fadeAnimator.isRunning()) {
                fadeAnimator.cancel();
            }
            
            fadeAnimator = ValueAnimator.ofFloat(thumbAlpha, 0f);
            fadeAnimator.setDuration(300);
            fadeAnimator.addUpdateListener(animation -> {
                thumbAlpha = (float) animation.getAnimatedValue();
                invalidate();
            });
            fadeAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(android.animation.Animator animation) {
                    isVisible = false;
                }
            });
            fadeAnimator.start();
        }
        
        private void scheduleHide() {
            hideHandler.removeCallbacks(hideRunnable);
            hideHandler.postDelayed(hideRunnable, FAST_SCROLL_AUTO_HIDE_MS);
        }
        
        public void cleanup() {
            hideHandler.removeCallbacks(hideRunnable);
            if (fadeAnimator != null) {
                fadeAnimator.cancel();
                fadeAnimator = null;
            }
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
        pdfTitle = getIntent().getStringExtra("shortcut_title");
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
        
        // Build UI first (must happen before setupImmersiveMode to avoid null DecorView)
        buildUI();
        
        // Setup immersive fullscreen (after setContentView in buildUI)
        setupImmersiveMode();
        
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
    
    /**
     * Handle orientation changes without activity restart.
     * Updates screen dimensions and recenters pages.
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        
        // Update screen dimensions
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        screenWidth = metrics.widthPixels;
        screenHeight = metrics.heightPixels;
        
        crashLogger.addBreadcrumb(CrashLogger.CAT_UI, 
            "Orientation changed: " + screenWidth + "x" + screenHeight);
        
        // Reset pan to recenter content
        if (recyclerView != null) {
            recyclerView.resetPan();
            recyclerView.invalidate();
        }
        
        // Trigger adapter rebind for new dimensions
        if (adapter != null) {
            adapter.notifyDataSetChanged();
        }
        
        // Re-render visible pages at new dimensions
        mainHandler.postDelayed(this::prerenderVisiblePages, 100);
    }
    
    private void setupImmersiveMode() {
        // Set status bar color to match header for premium appearance
        getWindow().setStatusBarColor(0xFF1C1C1E);
        
        // Use edge-to-edge layout with visible status bar (content below header)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                // Hide navigation bar but keep status bar for header integration
                controller.hide(WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            // For older Android versions, use standard flags
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
    }
    
    private void buildUI() {
        // Root uses LinearLayout for header + content stacking (premium design)
        rootLayout = new LinearLayout(this);
        rootLayout.setOrientation(LinearLayout.VERTICAL);
        rootLayout.setBackgroundColor(0xFF000000); // Pure black background
        rootLayout.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        
        // Wrapper for header space reservation - animates height for show/hide
        headerSpace = new FrameLayout(this);
        LinearLayout.LayoutParams headerSpaceParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpToPx(56) // Start with header visible
        );
        headerSpace.setLayoutParams(headerSpaceParams);
        headerSpace.setBackgroundColor(0xFF1C1C1E); // Match header color for seamless transition
        
        // Top bar - solid opaque premium background with subtle bottom border
        topBar = new FrameLayout(this);
        int topBarHeight = dpToPx(56);
        topBar.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, topBarHeight
        ));
        
        // Create layered background with bottom border
        GradientDrawable topBarBg = new GradientDrawable();
        topBarBg.setColor(0xFF1C1C1E); // Premium dark gray
        topBar.setBackground(topBarBg);
        topBar.setElevation(dpToPx(4)); // Subtle shadow
        topBar.setPadding(dpToPx(8), 0, dpToPx(8), 0);
        
        // Add subtle bottom border line
        View borderLine = new View(this);
        borderLine.setBackgroundColor(0x33FFFFFF); // 20% white for subtle separator
        FrameLayout.LayoutParams borderParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(1)
        );
        borderParams.gravity = Gravity.BOTTOM;
        borderLine.setLayoutParams(borderParams);
        topBar.addView(borderLine);
        
        // Close button with circular ripple
        closeButton = new ImageButton(this);
        closeButton.setImageResource(R.drawable.ic_close_pdf);
        closeButton.setBackgroundResource(R.drawable.ripple_circle);
        closeButton.setColorFilter(0xFFFFFFFF);
        closeButton.setScaleType(ImageView.ScaleType.CENTER);
        int buttonSize = dpToPx(48);
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(buttonSize, buttonSize);
        closeParams.gravity = Gravity.START | Gravity.CENTER_VERTICAL;
        closeButton.setLayoutParams(closeParams);
        closeButton.setOnClickListener(v -> exitViewer());
        topBar.addView(closeButton);
        
        // Page indicator (center) - premium typography
        pageIndicator = new TextView(this);
        pageIndicator.setTextColor(0xDEFFFFFF); // 87% white (Material primary text)
        pageIndicator.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        pageIndicator.setTypeface(pageIndicator.getTypeface(), Typeface.BOLD);
        FrameLayout.LayoutParams indicatorParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        indicatorParams.gravity = Gravity.CENTER;
        pageIndicator.setLayoutParams(indicatorParams);
        topBar.addView(pageIndicator);
        
        // "Open with" button - new external link icon with ripple
        openWithButton = new ImageButton(this);
        openWithButton.setImageResource(R.drawable.ic_open_external);
        openWithButton.setBackgroundResource(R.drawable.ripple_circle);
        openWithButton.setColorFilter(0xFFFFFFFF);
        openWithButton.setScaleType(ImageView.ScaleType.CENTER);
        FrameLayout.LayoutParams openWithParams = new FrameLayout.LayoutParams(buttonSize, buttonSize);
        openWithParams.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
        openWithButton.setLayoutParams(openWithParams);
        openWithButton.setOnClickListener(v -> openWithExternalApp());
        topBar.addView(openWithButton);
        
        headerSpace.addView(topBar);
        rootLayout.addView(headerSpace);
        
        // Content container (RecyclerView + fast scroll) - fills remaining space
        FrameLayout contentContainer = new FrameLayout(this);
        contentContainer.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f // weight = 1 to fill remaining space
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
        contentContainer.addView(recyclerView);
        
        // Fast scroll overlay
        fastScrollOverlay = new FastScrollOverlay(this);
        fastScrollOverlay.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        contentContainer.addView(fastScrollOverlay);
        
        rootLayout.addView(contentContainer);
        
        // Error view (hidden by default) - overlays entire layout
        errorView = buildCalmErrorView();
        errorView.setVisibility(View.GONE);
        
        // Wrap in FrameLayout to allow error overlay
        FrameLayout rootWrapper = new FrameLayout(this);
        rootWrapper.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        rootWrapper.addView(rootLayout);
        rootWrapper.addView(errorView);
        
        setContentView(rootWrapper);
        
        // Apply status bar insets to header
        applyHeaderInsets();
    }
    
    /**
     * Apply window insets to header for proper status bar spacing.
     */
    private void applyHeaderInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(headerSpace, (v, insets) -> {
            statusBarHeight = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            
            // Update header space height to include status bar
            int headerHeight = dpToPx(56) + statusBarHeight;
            ViewGroup.LayoutParams params = headerSpace.getLayoutParams();
            if (isTopBarVisible && params.height != headerHeight) {
                params.height = headerHeight;
                headerSpace.setLayoutParams(params);
            }
            
            // Add top padding to topBar for status bar clearance
            topBar.setPadding(dpToPx(8), statusBarHeight, dpToPx(8), 0);
            
            // Also update header background height
            FrameLayout.LayoutParams topBarParams = (FrameLayout.LayoutParams) topBar.getLayoutParams();
            topBarParams.height = headerHeight;
            topBar.setLayoutParams(topBarParams);
            
            return insets;
        });
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
            
            // Set ClipData with meaningful display name for external app
            String displayName = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "Document";
            android.content.ClipData clipData = android.content.ClipData.newUri(
                getContentResolver(), displayName, pdfUri);
            intent.setClipData(clipData);
            
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
        if (fastScrollOverlay != null) {
            fastScrollOverlay.setVisibility(View.GONE);
        }
        if (errorView != null) {
            errorView.setVisibility(View.VISIBLE);
        }
        hideHandler.removeCallbacks(hideRunnable);
    }
    
    private void setupGestureDetectors() {
        // Set up scale callback for activity-level state updates
        recyclerView.setScaleCallback(new ScaleCallback() {
            @Override
            public void onScaleBegin(float startZoom) {
                isScaling = true;
                crashLogger.addBreadcrumb(CrashLogger.CAT_ZOOM, "Pinch zoom started at " + startZoom + "x");
            }
            
            @Override
            public void onScale(float newZoom, float fx, float fy) {
                currentZoom = newZoom;
                // SMOOTH ZOOM: No throttled layout updates during gesture
                // Canvas-based scaling now handles all zoom levels smoothly
                // Layout will be committed once in onScaleEnd via commitZoomAndRerender()
            }
            
            @Override
            public void onScaleEnd(float finalZoom) {
                isScaling = false;
                previousZoom = currentZoom;
                currentZoom = finalZoom;
                crashLogger.addBreadcrumb(CrashLogger.CAT_ZOOM, "Pinch zoom ended: " + previousZoom + "x → " + currentZoom + "x");
                
                // Trigger high-res re-render at new zoom level
                commitZoomAndRerender();
            }
            
            @Override
            public void onSingleTapConfirmed() {
                toggleTopBar();
            }
            
            @Override
            public void onDoubleTap(float x, float y) {
                if (isDoubleTapAnimating) return;
                
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
                
                animateDoubleTapZoom(currentZoom, targetZoom, x, y);
            }
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
     * Also updates layout if zoom changed across the 1.0 threshold.
     */
    private void commitZoomAndRerender() {
        renderGeneration.incrementAndGet();
        pendingRenders.clear();
        
        // Notify adapter when zoom is below 1.0 to trigger layout changes
        // This enables the "train view" with more pages visible
        if (adapter != null && currentZoom < 1.0f) {
            adapter.notifyDataSetChanged();
        }
        
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
        
        // Add page gap decoration (zoom-aware for Drive-like appearance)
        pageGapPx = dpToPx(PAGE_GAP_DP);
        recyclerView.addItemDecoration(new RecyclerView.ItemDecoration() {
            @Override
            public void getItemOffsets(@NonNull Rect outRect, @NonNull View view, 
                    @NonNull RecyclerView parent, @NonNull RecyclerView.State state) {
                int position = parent.getChildAdapterPosition(view);
                if (position > 0) {
                    // Scale gap proportionally when zoomed out for tighter train view
                    int gap = pageGapPx;
                    if (currentZoom < 1.0f) {
                        gap = Math.max(dpToPx(2), (int)(pageGapPx * currentZoom));
                    }
                    outRect.top = gap;
                }
            }
        });
        
        adapter = new PdfPageAdapter();
        recyclerView.setAdapter(adapter);
        
        // Add scroll listener for page indicator, header auto-hide, and fast scroll
        recyclerView.addOnScrollListener(new RecyclerView.OnScrollListener() {
            private int lastDy = 0;
            private int accumulatedDy = 0;
            
            @Override
            public void onScrolled(@NonNull RecyclerView rv, int dx, int dy) {
                super.onScrolled(rv, dx, dy);
                
                // Update page indicator
                updatePageIndicator();
                
                // Update fast scroll thumb position
                if (fastScrollOverlay != null) {
                    fastScrollOverlay.updateThumbPosition();
                    if (Math.abs(dy) > 5) {
                        fastScrollOverlay.show();
                    }
                }
                
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
        
        // Initial fast scroll position
        recyclerView.post(() -> {
            if (fastScrollOverlay != null) {
                fastScrollOverlay.updateThumbPosition();
            }
        });
    }
    
    /**
     * Pre-render pages near the visible area for smooth scrolling.
     * Increased range and prioritizes low-res for distant pages.
     */
    private void prerenderNearbyPages(int centerPage) {
        if (adapter == null || pdfRenderer == null || renderExecutor == null) return;
        if (pageWidths == null) return;
        
        int start = Math.max(0, centerPage - PRERENDER_PAGES);
        int end = Math.min(pageWidths.length - 1, centerPage + PRERENDER_PAGES);
        
        // Render visible and near pages at high-res
        for (int i = centerPage - 2; i <= centerPage + 2; i++) {
            if (i < start || i > end) continue;
            
            String cacheKey = getCacheKey(i, currentZoom, false);
            if (bitmapCache.get(cacheKey) == null && !pendingRenders.contains(cacheKey)) {
                final int pageIndex = i;
                pendingRenders.add(cacheKey);
                renderExecutor.execute(() -> renderPageAsync(pageIndex, currentZoom, false));
            }
        }
        
        // Render distant pages at low-res only for faster preloading
        for (int i = start; i <= end; i++) {
            if (i >= centerPage - 2 && i <= centerPage + 2) continue; // Already handled above
            
            String lowKey = getCacheKey(i, currentZoom, true);
            String highKey = getCacheKey(i, currentZoom, false);
            if (bitmapCache.get(lowKey) == null && bitmapCache.get(highKey) == null && !pendingRenders.contains(highKey)) {
                final int pageIndex = i;
                pendingRenders.add(highKey);
                renderExecutor.execute(() -> renderPageAsync(pageIndex, currentZoom, true)); // Low-res only
            }
        }
    }
    
    private void updatePageIndicator() {
        if (pageWidths == null) return;
        
        LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (layoutManager == null) return;
        
        int firstVisible = layoutManager.findFirstVisibleItemPosition();
        int lastVisible = layoutManager.findLastVisibleItemPosition();
        int totalPages = pageWidths.length;
        
        if (firstVisible < 0 || totalPages <= 0) return;
        
        // Display 1-indexed pages
        int firstPage = firstVisible + 1;
        int lastPage = lastVisible + 1;
        
        // Format: "1-5/121" for multiple visible, "1/121" for single page
        String rangeText;
        if (firstPage == lastPage) {
            rangeText = firstPage + "/" + totalPages;
        } else {
            rangeText = firstPage + "-" + lastPage + "/" + totalPages;
        }
        
        // Update header indicator
        if (pageIndicator != null) {
            pageIndicator.setText(firstPage + " / " + totalPages);
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
        if (topBar != null && headerSpace != null && !isTopBarVisible) {
            isTopBarVisible = true;
            
            // Cancel any running animation
            if (headerAnimator != null && headerAnimator.isRunning()) {
                headerAnimator.cancel();
            }
            
            int targetHeight = dpToPx(56) + statusBarHeight;
            headerAnimator = ValueAnimator.ofInt(headerSpace.getHeight(), targetHeight);
            headerAnimator.setDuration(200);
            headerAnimator.setInterpolator(new DecelerateInterpolator());
            headerAnimator.addUpdateListener(animation -> {
                ViewGroup.LayoutParams params = headerSpace.getLayoutParams();
                params.height = (int) animation.getAnimatedValue();
                headerSpace.setLayoutParams(params);
            });
            headerAnimator.addListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationStart(Animator animation) {
                    topBar.setVisibility(View.VISIBLE);
                    topBar.setAlpha(0f);
                }
            });
            
            // Fade in topBar
            topBar.animate()
                .alpha(1f)
                .setDuration(200)
                .start();
            
            headerAnimator.start();
            scheduleHide();
        } else if (topBar != null && isTopBarVisible) {
            // Already visible, just reschedule hide
            scheduleHide();
        }
    }
    
    private void hideTopBar() {
        if (topBar != null && headerSpace != null && isTopBarVisible) {
            isTopBarVisible = false;
            hideHandler.removeCallbacks(hideRunnable);
            
            // Cancel any running animation
            if (headerAnimator != null && headerAnimator.isRunning()) {
                headerAnimator.cancel();
            }
            
            // Collapse header space
            headerAnimator = ValueAnimator.ofInt(headerSpace.getHeight(), 0);
            headerAnimator.setDuration(200);
            headerAnimator.setInterpolator(new AccelerateInterpolator());
            headerAnimator.addUpdateListener(animation -> {
                ViewGroup.LayoutParams params = headerSpace.getLayoutParams();
                params.height = (int) animation.getAnimatedValue();
                headerSpace.setLayoutParams(params);
            });
            
            // Fade out topBar
            topBar.animate()
                .alpha(0f)
                .setDuration(150)
                .start();
            
            headerAnimator.start();
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
     * Get cached page height with zoom-aware layout.
     * 
     * When zoomed out (< 1.0x), scale layout heights proportionally so more pages
     * are bound by RecyclerView, creating the "train of pages" effect.
     * When zoomed in (>= 1.0x), layout stays at 1.0x and canvas handles visual scaling.
     */
    private int getScaledPageHeight(int pageIndex) {
        if (pageWidths == null || pageIndex < 0 || pageIndex >= pageWidths.length) {
            return screenHeight / 2;
        }
        
        // Base height at 1.0x (fit-to-width)
        float scale = (float) screenWidth / pageWidths[pageIndex];
        int baseHeight = (int) (pageHeights[pageIndex] * scale);
        
        // When zoomed out, scale layout heights to show more pages
        // This allows RecyclerView to bind more items, creating the train view
        if (currentZoom < 1.0f) {
            return (int) (baseHeight * currentZoom);
        }
        
        // At or above 1.0x: Layout at full size, canvas handles zoom
        return baseHeight;
    }
    
    /**
     * Get page width with zoom-aware layout.
     * 
     * When zoomed out (< 1.0x), scale width proportionally to create centered
     * narrow page tiles with dark background on sides (Google Drive style).
     * When zoomed in (>= 1.0x), pages fill the screen width.
     */
    private int getScaledPageWidth(int pageIndex) {
        // At or above 1.0x: Full screen width
        if (currentZoom >= 1.0f) {
            return screenWidth;
        }
        // When zoomed out: Scale width proportionally
        return (int) (screenWidth * currentZoom);
    }
    
    /**
     * Calculate safe bitmap dimensions that won't exceed Android's canvas limits.
     * Maintains aspect ratio while capping total size.
     * 
     * This prevents RuntimeException: "Canvas: trying to draw too large bitmap"
     * which occurs at high zoom levels (e.g., 5.0x on large PDFs).
     */
    private int[] getSafeBitmapDimensions(int requestedWidth, int requestedHeight) {
        // Check against max dimension (hardware texture limit)
        int maxDim = Math.max(requestedWidth, requestedHeight);
        float scale = 1.0f;
        
        if (maxDim > MAX_BITMAP_DIMENSION) {
            scale = (float) MAX_BITMAP_DIMENSION / maxDim;
        }
        
        int width = (int) (requestedWidth * scale);
        int height = (int) (requestedHeight * scale);
        
        // Check against max memory (ARGB_8888 = 4 bytes per pixel)
        long totalBytes = (long) width * height * 4;
        if (totalBytes > MAX_BITMAP_BYTES) {
            float memoryScale = (float) Math.sqrt((double) MAX_BITMAP_BYTES / totalBytes);
            width = (int) (width * memoryScale);
            height = (int) (height * memoryScale);
        }
        
        return new int[] { Math.max(1, width), Math.max(1, height) };
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
            int requestedLowWidth = Math.max(1, (int) (pageWidth * lowScale));
            int requestedLowHeight = Math.max(1, (int) (pageHeight * lowScale));
            
            // Clamp to safe dimensions to prevent Canvas crash
            int[] safeLowDims = getSafeBitmapDimensions(requestedLowWidth, requestedLowHeight);
            int lowWidth = safeLowDims[0];
            int lowHeight = safeLowDims[1];
            
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
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            if (renderGeneration.get() != generation) {
                pendingRenders.remove(getCacheKey(pageIndex, targetZoom, false));
                return;
            }
            
            // --- High-res pass ---
            float highScale = baseScale * targetZoom;
            int requestedHighWidth = Math.max(1, (int) (pageWidth * highScale));
            int requestedHighHeight = Math.max(1, (int) (pageHeight * highScale));
            
            // Clamp to safe dimensions to prevent Canvas crash
            int[] safeHighDims = getSafeBitmapDimensions(requestedHighWidth, requestedHighHeight);
            int highWidth = safeHighDims[0];
            int highHeight = safeHighDims[1];
            
            if (highWidth != requestedHighWidth || highHeight != requestedHighHeight) {
                Log.d(TAG, "Clamped bitmap from " + requestedHighWidth + "x" + requestedHighHeight + 
                      " to " + highWidth + "x" + highHeight + " for page " + pageIndex);
                crashLogger.addBreadcrumb(CrashLogger.CAT_IO, 
                    "Bitmap clamped: " + requestedHighWidth + "x" + requestedHighHeight + 
                    " → " + highWidth + "x" + highHeight);
            }
            
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
        
        if (fastScrollOverlay != null) {
            fastScrollOverlay.cleanup();
        }
        
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
        
        // Exit to home screen (not back to One Tap app)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask();
        } else {
            finish();
        }
        overridePendingTransition(0, android.R.anim.fade_out);
    }
    
    /**
     * RecyclerView adapter for PDF pages.
     * Layout height and width scale with zoom when below 1.0x for train view.
     * Pages are wrapped in FrameLayout for horizontal centering.
     */
    private class PdfPageAdapter extends RecyclerView.Adapter<PdfPageAdapter.PageViewHolder> {
        
        @NonNull
        @Override
        public PageViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            // Wrapper FrameLayout for centering pages horizontally
            FrameLayout wrapper = new FrameLayout(parent.getContext());
            wrapper.setLayoutParams(new RecyclerView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ));
            
            // Actual page ImageView - centered inside wrapper
            ImageView imageView = new ImageView(parent.getContext());
            FrameLayout.LayoutParams imageParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            imageParams.gravity = Gravity.CENTER_HORIZONTAL;
            imageView.setLayoutParams(imageParams);
            imageView.setScaleType(ImageView.ScaleType.FIT_CENTER);
            imageView.setBackgroundColor(0xFFFFFFFF);
            
            // Add subtle elevation for card-like shadow effect (Drive-style)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                imageView.setElevation(dpToPx(PAGE_ELEVATION_DP));
                imageView.setOutlineProvider(ViewOutlineProvider.BOUNDS);
                imageView.setClipToOutline(true);
            }
            
            wrapper.addView(imageView);
            return new PageViewHolder(wrapper, imageView);
        }
        
        @Override
        public void onBindViewHolder(@NonNull PageViewHolder holder, int position) {
            holder.pageIndex = position;
            
            // Set both width and height from cached dimensions (zoom-aware for train view)
            int width = getScaledPageWidth(position);
            int height = getScaledPageHeight(position);
            
            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) holder.imageView.getLayoutParams();
            params.width = width;
            params.height = height;
            holder.imageView.setLayoutParams(params);
            
            // Update wrapper height to match
            ViewGroup.LayoutParams wrapperParams = holder.wrapper.getLayoutParams();
            wrapperParams.height = height;
            holder.wrapper.setLayoutParams(wrapperParams);
            
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
                    // Use a subtle gray placeholder instead of pure white
                    // This provides visual feedback that content is loading
                    holder.imageView.setImageBitmap(null);
                    holder.imageView.setBackgroundColor(0xFFF5F5F5);
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
                if (child instanceof FrameLayout) {
                    FrameLayout wrapper = (FrameLayout) child;
                    if (wrapper.getChildCount() > 0 && wrapper.getChildAt(0) instanceof ImageView) {
                        ImageView imageView = (ImageView) wrapper.getChildAt(0);
                        
                        Bitmap current = null;
                        if (imageView.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
                            current = ((android.graphics.drawable.BitmapDrawable) imageView.getDrawable()).getBitmap();
                        }
                        
                        String highKey = getCacheKey(pageIndex, currentZoom, false);
                        boolean shouldUpdate = !isLowRes || current == null || bitmapCache.get(highKey) == null;
                        
                        if (shouldUpdate && bitmap != null && !bitmap.isRecycled()) {
                            imageView.setImageBitmap(bitmap);
                            
                            // Update dimensions only if at 1.0x or above (train view handles its own sizing)
                            if (currentZoom >= 1.0f) {
                                FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) imageView.getLayoutParams();
                                if (params.height != height) {
                                    params.width = screenWidth;
                                    params.height = height;
                                    imageView.setLayoutParams(params);
                                    
                                    ViewGroup.LayoutParams wrapperParams = wrapper.getLayoutParams();
                                    wrapperParams.height = height;
                                    wrapper.setLayoutParams(wrapperParams);
                                }
                            }
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
            FrameLayout wrapper;
            ImageView imageView;
            int pageIndex = -1;
            
            PageViewHolder(FrameLayout wrapper, ImageView imageView) {
                super(wrapper);
                this.wrapper = wrapper;
                this.imageView = imageView;
            }
        }
    }
}
