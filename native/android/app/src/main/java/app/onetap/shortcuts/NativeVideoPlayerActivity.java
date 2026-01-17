package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.MediaController;
import android.widget.VideoView;

/**
 * NativeVideoPlayerActivity
 * Uses Android's native VideoView so playback doesn't depend on WebView codecs/network stack.
 */
public class NativeVideoPlayerActivity extends Activity {
    private static final String TAG = "NativeVideoPlayer";
    private static final int AUTO_HIDE_DELAY_MS = 4000;

    private ImageButton closeButton;
    private View headerGradient;
    private Handler hideHandler = new Handler(Looper.getMainLooper());
    private boolean controlsVisible = true;

    private Runnable hideRunnable = new Runnable() {
        @Override
        public void run() {
            hideControls();
        }
    };

    private void exitPlayerAndApp() {
        Log.d(TAG, "Exiting player");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask();
        } else {
            finish();
        }
    }

    private void showControls() {
        controlsVisible = true;
        if (closeButton != null) {
            closeButton.setVisibility(View.VISIBLE);
            closeButton.animate().alpha(1f).setDuration(200).start();
        }
        if (headerGradient != null) {
            headerGradient.setVisibility(View.VISIBLE);
            headerGradient.animate().alpha(1f).setDuration(200).start();
        }
        scheduleHide();
    }

    private void hideControls() {
        controlsVisible = false;
        if (closeButton != null) {
            closeButton.animate().alpha(0f).setDuration(200).withEndAction(() -> {
                if (!controlsVisible && closeButton != null) {
                    closeButton.setVisibility(View.INVISIBLE);
                }
            }).start();
        }
        if (headerGradient != null) {
            headerGradient.animate().alpha(0f).setDuration(200).withEndAction(() -> {
                if (!controlsVisible && headerGradient != null) {
                    headerGradient.setVisibility(View.INVISIBLE);
                }
            }).start();
        }
    }

    private void toggleControls() {
        if (controlsVisible) {
            hideHandler.removeCallbacks(hideRunnable);
            hideControls();
        } else {
            showControls();
        }
    }

    private void scheduleHide() {
        hideHandler.removeCallbacks(hideRunnable);
        hideHandler.postDelayed(hideRunnable, AUTO_HIDE_DELAY_MS);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event != null && event.getKeyCode() == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
            exitPlayerAndApp();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        exitPlayerAndApp();
    }

    /**
     * Custom drawable that draws an X icon
     */
    private static class CloseIconDrawable extends Drawable {
        private final Paint paint;
        
        public CloseIconDrawable() {
            paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.WHITE);
            paint.setStrokeWidth(6f);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStyle(Paint.Style.STROKE);
        }

        @Override
        public void draw(Canvas canvas) {
            int width = getBounds().width();
            int height = getBounds().height();
            int padding = (int) (width * 0.3f);
            
            // Draw X
            canvas.drawLine(padding, padding, width - padding, height - padding, paint);
            canvas.drawLine(width - padding, padding, padding, height - padding, paint);
        }

        @Override
        public void setAlpha(int alpha) {
            paint.setAlpha(alpha);
        }

        @Override
        public void setColorFilter(ColorFilter colorFilter) {
            paint.setColorFilter(colorFilter);
        }

        @Override
        public int getOpacity() {
            return PixelFormat.TRANSLUCENT;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Make fullscreen
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Create root FrameLayout
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        // Create VideoView
        VideoView videoView = new VideoView(this);
        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.CENTER
        );
        root.addView(videoView, videoParams);

        // Create overlay container (on top of video)
        FrameLayout overlayContainer = new FrameLayout(this);
        overlayContainer.setClickable(false);
        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(overlayContainer, overlayParams);

        // Create header gradient overlay
        headerGradient = new View(this);
        int gradientHeight = (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, 120, getResources().getDisplayMetrics()
        );
        GradientDrawable gradient = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0xDD000000, 0x00000000}
        );
        headerGradient.setBackground(gradient);
        FrameLayout.LayoutParams gradientParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            gradientHeight,
            Gravity.TOP
        );
        overlayContainer.addView(headerGradient, gradientParams);

        // Create close button with custom X drawable
        closeButton = new ImageButton(this);
        closeButton.setImageDrawable(new CloseIconDrawable());
        
        // Create circular semi-transparent background
        GradientDrawable buttonBg = new GradientDrawable();
        buttonBg.setShape(GradientDrawable.OVAL);
        buttonBg.setColor(0x66000000); // Semi-transparent black
        closeButton.setBackground(buttonBg);
        closeButton.setContentDescription("Close");
        closeButton.setClickable(true);
        closeButton.setFocusable(true);
        
        int buttonSize = (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, 48, getResources().getDisplayMetrics()
        );
        int buttonMargin = (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, 20, getResources().getDisplayMetrics()
        );
        int buttonPadding = (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, 12, getResources().getDisplayMetrics()
        );
        
        FrameLayout.LayoutParams buttonParams = new FrameLayout.LayoutParams(buttonSize, buttonSize);
        buttonParams.gravity = Gravity.TOP | Gravity.START;
        buttonParams.setMargins(buttonMargin, buttonMargin, 0, 0);
        closeButton.setPadding(buttonPadding, buttonPadding, buttonPadding, buttonPadding);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            closeButton.setElevation(8f);
        }
        
        overlayContainer.addView(closeButton, buttonParams);

        closeButton.setOnClickListener(v -> {
            Log.d(TAG, "Close button clicked");
            exitPlayerAndApp();
        });

        // Tap on video toggles controls
        videoView.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_UP) {
                toggleControls();
            }
            return true;
        });

        // Setup MediaController
        MediaController controller = new MediaController(this);
        controller.setAnchorView(videoView);
        videoView.setMediaController(controller);

        Intent intent = getIntent();
        Uri uri = intent != null ? intent.getData() : null;
        String mimeType = intent != null ? intent.getType() : null;

        Log.d(TAG, "Starting native playback. uri=" + uri + ", type=" + mimeType);

        if (uri == null) {
            finish();
            return;
        }

        videoView.setOnErrorListener((mp, what, extra) -> {
            Log.e(TAG, "VideoView error what=" + what + " extra=" + extra + " uri=" + uri);
            return false;
        });

        videoView.setOnPreparedListener(mp -> {
            Log.d(TAG, "Video prepared, starting playback");
            videoView.start();
            showControls();
        });

        try {
            videoView.setVideoURI(uri);
            videoView.requestFocus();
        } catch (Exception e) {
            Log.e(TAG, "Failed to setVideoURI: " + e.getMessage());
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        hideHandler.removeCallbacks(hideRunnable);
    }
}
