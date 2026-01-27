package app.onetap.shortcuts;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Log;
import android.util.Rational;
import android.util.TypedValue;
import android.view.Display;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.OptIn;
import androidx.annotation.RequiresApi;
import androidx.media3.common.C;
import androidx.media3.common.ColorInfo;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * NativeVideoPlayerActivity
 * Premium video player with ExoPlayer (Media3) for broad codec support.
 * Features: HDR playback, gestures (double-tap seek, swipe volume/brightness),
 * PiP mode, and cinematic UI.
 */
@OptIn(markerClass = UnstableApi.class)
public class NativeVideoPlayerActivity extends Activity {
    private static final String TAG = "NativeVideoPlayer";
    private static final int AUTO_HIDE_DELAY_MS = 3500;
    private static final float[] PLAYBACK_SPEEDS = {0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f};

    private FrameLayout root;
    private PlayerView playerView;
    private LinearLayout topBar;
    private TextView speedButton;
    private TextView debugTextView;
    private TextView titleView;
    private ImageButton closeButton;
    private ImageButton lockButton;
    private ImageButton floatingUnlockButton;
    private LinearLayout floatingUnlockContainer;
    private TextView floatingUnlockLabel;
    private ImageView lockStateIndicator;
    private boolean isTopBarVisible = true;
    private boolean isControlsLocked = false;

    private ExoPlayer exoPlayer;

    private Uri videoUri;
    private String videoMimeType;
    private String videoTitle = "";
    private boolean hasTriedExternalFallback = false;
    private int currentSpeedIndex = 2; // Default to 1.0x

    // Store the raw intent for diagnostics
    private Intent launchIntent;

    // HDR state
    private boolean isHdrContent = false;
    private boolean isHdrDisplaySupported = false;
    private String hdrType = "SDR";
    private String colorSpace = "unknown";
    private String colorTransfer = "unknown";

    // Picture-in-Picture state
    private boolean isInPipMode = false;
    private boolean isPipEnabled = true; // User preference from settings
    private int videoWidth = 16;
    private int videoHeight = 9;
    private static final String PIP_ACTION_PLAY_PAUSE = "app.onetap.shortcuts.PIP_PLAY_PAUSE";
    private static final String PIP_ACTION_SEEK_BACK = "app.onetap.shortcuts.PIP_SEEK_BACK";
    private static final String PIP_ACTION_SEEK_FORWARD = "app.onetap.shortcuts.PIP_SEEK_FORWARD";
    private static final long PIP_SEEK_INCREMENT_MS = 10000;
    private BroadcastReceiver pipActionReceiver;

    // Gesture controls
    private GestureDetector gestureDetector;
    private static final long DOUBLE_TAP_SEEK_MS = 10000;
    private TextView seekIndicatorLeft;
    private TextView seekIndicatorRight;
    private int cumulativeSeekLeft = 0;
    private int cumulativeSeekRight = 0;
    private final Handler seekIndicatorHandler = new Handler(Looper.getMainLooper());

    // Volume/brightness gesture state
    private TextView gestureIndicator;
    private float initialTouchY;
    private float initialVolume;
    private float initialBrightness;
    private boolean isSwipeGestureActive = false;
    private boolean isVolumeGesture = false;
    private AudioManager audioManager;
    private int maxVolume;

    // Auto-rotate orientation lock
    private int originalOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private boolean hasLockedOrientation = false;

    // Premium loading indicator
    private FrameLayout loadingOverlay;
    private ValueAnimator loadingAnimator;

    // Debug logging
    private final List<String> debugLogs = new ArrayList<>();
    private long startTimeMs;

    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private final Runnable hideRunnable = this::hideTopBar;

    private void logDebug(String level, String message) {
        long elapsed = System.currentTimeMillis() - startTimeMs;
        String timestamp = String.format(Locale.US, "+%d.%03ds", elapsed / 1000, elapsed % 1000);
        String logLine = String.format("[%s] %s: %s", timestamp, level, message);
        
        // Log to Android logcat
        if ("ERROR".equals(level)) {
            Log.e(TAG, message);
        } else if ("WARN".equals(level)) {
            Log.w(TAG, message);
        } else {
            Log.d(TAG, message);
        }
        
        // Store for debug overlay
        debugLogs.add(logLine);
        
        // Update debug overlay if visible
        updateDebugOverlay();
    }

    private void logInfo(String message) {
        logDebug("INFO", message);
    }

    private void logWarn(String message) {
        logDebug("WARN", message);
    }

    private void logError(String message) {
        logDebug("ERROR", message);
    }

    private void updateDebugOverlay() {
        if (debugTextView == null) return;
        
        runOnUiThread(() -> {
            StringBuilder sb = new StringBuilder();
            sb.append("=== VIDEO PLAYER DEBUG (ExoPlayer) ===\n\n");
            
            // Device info
            sb.append("DEVICE:\n");
            sb.append("  Model: ").append(Build.MODEL).append("\n");
            sb.append("  Android: ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
            sb.append("  Manufacturer: ").append(Build.MANUFACTURER).append("\n");
            sb.append("  HDR Display: ").append(isHdrDisplaySupported ? "YES" : "NO").append("\n\n");
            
            // Video info
            sb.append("VIDEO:\n");
            sb.append("  URI: ").append(videoUri != null ? videoUri.toString() : "null").append("\n");
            sb.append("  Scheme: ").append(videoUri != null ? videoUri.getScheme() : "null").append("\n");
            sb.append("  MIME: ").append(videoMimeType).append("\n");
            
            // ExoPlayer state
            if (exoPlayer != null) {
                sb.append("  Duration: ").append(exoPlayer.getDuration() / 1000).append("s\n");
                sb.append("  Position: ").append(exoPlayer.getCurrentPosition() / 1000).append("s\n");
            }
            sb.append("\n");
            
            // HDR info
            sb.append("HDR:\n");
            sb.append("  Content Type: ").append(hdrType).append("\n");
            sb.append("  Color Space: ").append(colorSpace).append("\n");
            sb.append("  Transfer: ").append(colorTransfer).append("\n");
            sb.append("  HDR Active: ").append(isHdrContent && isHdrDisplaySupported ? "YES" : "NO").append("\n\n");
            
            // State
            sb.append("STATE:\n");
            sb.append("  isPlaying: ").append(exoPlayer != null && exoPlayer.isPlaying()).append("\n");
            sb.append("  playbackState: ").append(getPlaybackStateString()).append("\n");
            sb.append("  hasTriedExternal: ").append(hasTriedExternalFallback).append("\n\n");
            
            // Timeline
            sb.append("TIMELINE:\n");
            for (String log : debugLogs) {
                sb.append("  ").append(log).append("\n");
            }
            
            debugTextView.setText(sb.toString());
        });
    }

    private String getPlaybackStateString() {
        if (exoPlayer == null) return "null";
        switch (exoPlayer.getPlaybackState()) {
            case Player.STATE_IDLE: return "IDLE";
            case Player.STATE_BUFFERING: return "BUFFERING";
            case Player.STATE_READY: return "READY";
            case Player.STATE_ENDED: return "ENDED";
            default: return "UNKNOWN";
        }
    }
    
    /**
     * Load user settings from SharedPreferences (synced from WebView localStorage).
     * The WebView app stores settings in 'onetap_settings' which we read here.
     */
    private void loadUserSettings() {
        try {
            // Read from app_settings SharedPreferences (synced from WebView via ShortcutPlugin.syncSettings)
            android.content.SharedPreferences prefs = getSharedPreferences(
                "app_settings", Context.MODE_PRIVATE
            );
            
            String settingsJson = prefs.getString("settings", null);
            
            if (settingsJson != null && !settingsJson.isEmpty()) {
                // Parse JSON to extract pipModeEnabled
                org.json.JSONObject settings = new org.json.JSONObject(settingsJson);
                isPipEnabled = settings.optBoolean("pipModeEnabled", true);
                logInfo("Loaded PiP setting from synced prefs: " + (isPipEnabled ? "enabled" : "disabled"));
            } else {
                // No settings synced yet, default to enabled
                isPipEnabled = true;
                logInfo("No synced settings found, PiP defaulting to enabled");
            }
        } catch (Exception e) {
            logWarn("Failed to load user settings: " + e.getMessage());
            isPipEnabled = true; // Default to enabled on error
        }
    }

    private void exitPlayerAndApp() {
        logInfo("Exiting player");
        releasePlayer();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask();
        } else {
            finish();
        }
    }

    private void releasePlayer() {
        hideHandler.removeCallbacks(hideRunnable);

        // Restore original orientation before releasing
        restoreOriginalOrientation();

        if (exoPlayer != null) {
            try {
                exoPlayer.stop();
                exoPlayer.release();
            } catch (Exception ignored) {}
            exoPlayer = null;
        }
    }
    
    /**
     * Lock screen orientation based on video aspect ratio.
     * Landscape videos lock to landscape, portrait videos lock to portrait.
     */
    private void lockOrientationBasedOnAspectRatio(int width, int height) {
        if (hasLockedOrientation || isInPipMode) {
            return; // Already locked or in PiP mode
        }
        
        try {
            // Store original orientation for restoration
            originalOrientation = getRequestedOrientation();
            
            float aspectRatio = (float) width / height;
            int targetOrientation;
            
            if (aspectRatio > 1.0f) {
                // Landscape video (wider than tall)
                targetOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
                logInfo("Locking to landscape orientation (aspect ratio: " + String.format(Locale.US, "%.2f", aspectRatio) + ")");
            } else if (aspectRatio < 1.0f) {
                // Portrait video (taller than wide)
                targetOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
                logInfo("Locking to portrait orientation (aspect ratio: " + String.format(Locale.US, "%.2f", aspectRatio) + ")");
            } else {
                // Square video - use sensor to allow any orientation
                targetOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR;
                logInfo("Square video - allowing sensor orientation");
            }
            
            setRequestedOrientation(targetOrientation);
            hasLockedOrientation = true;
            
            // Haptic feedback for orientation lock
            performHapticFeedback();
            
        } catch (Exception e) {
            logWarn("Failed to lock orientation: " + e.getMessage());
        }
    }
    
    /**
     * Restore the original screen orientation when exiting the player.
     */
    private void restoreOriginalOrientation() {
        if (hasLockedOrientation) {
            try {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                hasLockedOrientation = false;
                logInfo("Restored original orientation");
            } catch (Exception e) {
                logWarn("Failed to restore orientation: " + e.getMessage());
            }
        }
    }
    
    /**
     * Toggle between portrait and landscape orientation manually.
     */
    private void toggleOrientation() {
        try {
            int currentOrientation = getResources().getConfiguration().orientation;
            int targetOrientation;
            String orientationName;
            
            if (currentOrientation == Configuration.ORIENTATION_LANDSCAPE) {
                // Switch to portrait
                targetOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
                orientationName = "Portrait";
            } else {
                // Switch to landscape
                targetOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
                orientationName = "Landscape";
            }
            
            setRequestedOrientation(targetOrientation);
            hasLockedOrientation = true;
            
            // Show brief toast feedback
            Toast.makeText(this, orientationName, Toast.LENGTH_SHORT).show();
            logInfo("Manually toggled to " + orientationName + " orientation");
            
        } catch (Exception e) {
            logWarn("Failed to toggle orientation: " + e.getMessage());
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

    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp, getResources().getDisplayMetrics()
        );
    }

    // setupDoubleTapGesture removed - replaced by setupGestures which handles all gestures

    /**
     * Perform seek by double-tap with cumulative effect and visual feedback.
     */
    private void seekByDoubleTap(long seekMs, boolean isLeft) {
        if (exoPlayer == null) return;
        
        long currentPos = exoPlayer.getCurrentPosition();
        long duration = exoPlayer.getDuration();
        long newPosition = currentPos + seekMs;
        
        // Clamp position
        if (newPosition < 0) newPosition = 0;
        if (duration > 0 && newPosition > duration) newPosition = duration;
        
        exoPlayer.seekTo(newPosition);
        
        // Update cumulative seek counter for visual feedback
        int seekSeconds = (int) (Math.abs(seekMs) / 1000);
        
        if (isLeft) {
            cumulativeSeekLeft += seekSeconds;
            showSeekIndicator(true, cumulativeSeekLeft);
            // Reset cumulative after delay
            seekIndicatorHandler.removeCallbacksAndMessages("left");
            seekIndicatorHandler.postDelayed(() -> {
                cumulativeSeekLeft = 0;
            }, 1000);
        } else {
            cumulativeSeekRight += seekSeconds;
            showSeekIndicator(false, cumulativeSeekRight);
            // Reset cumulative after delay
            seekIndicatorHandler.removeCallbacksAndMessages("right");
            seekIndicatorHandler.postDelayed(() -> {
                cumulativeSeekRight = 0;
            }, 1000);
        }
        
        logInfo("Double-tap seek: " + (seekMs > 0 ? "+" : "") + (seekMs / 1000) + "s");
    }

    /**
     * Create the seek indicator overlays (left and right).
     */
    private void createSeekIndicators() {
        // Left indicator (rewind)
        seekIndicatorLeft = createSeekIndicatorView(true);
        FrameLayout.LayoutParams leftParams = new FrameLayout.LayoutParams(
            dpToPx(100), dpToPx(100)
        );
        leftParams.gravity = Gravity.CENTER_VERTICAL | Gravity.START;
        leftParams.leftMargin = dpToPx(60);
        root.addView(seekIndicatorLeft, leftParams);

        // Right indicator (forward)
        seekIndicatorRight = createSeekIndicatorView(false);
        FrameLayout.LayoutParams rightParams = new FrameLayout.LayoutParams(
            dpToPx(100), dpToPx(100)
        );
        rightParams.gravity = Gravity.CENTER_VERTICAL | Gravity.END;
        rightParams.rightMargin = dpToPx(60);
        root.addView(seekIndicatorRight, rightParams);
    }

    /**
     * Create a premium seek indicator view with glassmorphism effect.
     */
    private TextView createSeekIndicatorView(boolean isRewind) {
        TextView indicator = new TextView(this);
        indicator.setTextColor(Color.WHITE);
        indicator.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        indicator.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        indicator.setGravity(Gravity.CENTER);
        indicator.setVisibility(View.GONE);
        indicator.setAlpha(0f);
        
        // Premium glassmorphism circular background
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0x80000000);
        bg.setStroke(dpToPx(2), 0x40FFFFFF);
        indicator.setBackground(bg);
        indicator.setElevation(dpToPx(12));
        
        return indicator;
    }

    /**
     * Show the seek indicator with premium overshoot animation.
     */
    private void showSeekIndicator(boolean isLeft, int totalSeconds) {
        TextView indicator = isLeft ? seekIndicatorLeft : seekIndicatorRight;
        if (indicator == null) return;
        
        // Set text with arrow icon and seconds
        String icon = isLeft ? "◀◀" : "▶▶";
        indicator.setText(icon + "\n" + totalSeconds + "s");
        
        // Cancel any running animation
        indicator.animate().cancel();
        seekIndicatorHandler.removeCallbacksAndMessages(null);
        
        // Show with premium overshoot animation
        indicator.setVisibility(View.VISIBLE);
        indicator.setScaleX(0.3f);
        indicator.setScaleY(0.3f);
        indicator.setAlpha(0f);
        indicator.setRotation(isLeft ? -15f : 15f);
        
        indicator.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .rotation(0f)
            .setDuration(250)
            .setInterpolator(new OvershootInterpolator(1.5f))
            .setListener(null)
            .start();
        
        // Schedule hide
        seekIndicatorHandler.postDelayed(() -> hideSeekIndicator(isLeft), 700);
    }

    /**
     * Hide the seek indicator with smooth fade-out animation.
     */
    private void hideSeekIndicator(boolean isLeft) {
        TextView indicator = isLeft ? seekIndicatorLeft : seekIndicatorRight;
        if (indicator == null || indicator.getVisibility() != View.VISIBLE) return;
        
        indicator.animate()
            .alpha(0f)
            .scaleX(0.7f)
            .scaleY(0.7f)
            .setDuration(250)
            .setInterpolator(new AccelerateDecelerateInterpolator())
            .setListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(Animator animation) {
                    indicator.setVisibility(View.GONE);
                }
            })
            .start();
    }

    /**
     * Apply immersive fullscreen safely.
     *
     * On some OEM builds, calling getWindow().getInsetsController() too early can crash
     * because the decor view isn't created yet.
     */
    /**
     * Apply immersive fullscreen safely - Android 15/16 compatible.
     *
     * CRITICAL: On Android 15+ (API 35+), accessing DecorView.getWindowInsetsController()
     * can throw NullPointerException if the DecorView isn't fully attached yet.
     * 
     * Solution: Use getWindow().getInsetsController() which is safe and doesn't require
     * the DecorView to be fully initialized.
     */
    private void applyImmersiveModeSafely() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Set window to draw behind system bars
                try {
                    getWindow().setDecorFitsSystemWindows(false);
                } catch (Throwable ignored) {}

                // ANDROID 15-SAFE: Get controller directly from Window, NOT from DecorView
                // This avoids the NullPointerException on Android 15/16 devices
                WindowInsetsController controller = null;
                try {
                    controller = getWindow().getInsetsController();
                } catch (Throwable ignored) {}

                if (controller != null) {
                    // Hide system bars and set transient behavior
                    controller.hide(WindowInsets.Type.systemBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    logInfo("Immersive mode applied via WindowInsetsController");
                } else {
                    // Fallback to legacy flags if controller is null
                    applyLegacyImmersiveMode();
                }
            } else {
                // Pre-Android 11: Use legacy system UI visibility flags
                applyLegacyImmersiveMode();
            }
        } catch (Throwable t) {
            // Never crash the player because of fullscreen chrome
            try {
                Log.w(TAG, "applyImmersiveModeSafely failed, trying legacy fallback", t);
                applyLegacyImmersiveMode();
            } catch (Throwable ignored) {}
        }
    }

    /**
     * Legacy immersive mode using deprecated setSystemUiVisibility flags.
     * Used as fallback for pre-Android 11 devices or when WindowInsetsController fails.
     */
    @SuppressWarnings("deprecation")
    private void applyLegacyImmersiveMode() {
        try {
            View decor = getWindow().getDecorView();
            if (decor != null) {
                decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                );
                logInfo("Immersive mode applied via legacy setSystemUiVisibility");
            }
        } catch (Throwable t) {
            Log.w(TAG, "applyLegacyImmersiveMode failed", t);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startTimeMs = System.currentTimeMillis();

        try {
            logInfo("onCreate started (Premium ExoPlayer)");
            
            // Load user settings
            loadUserSettings();
            
            // Initialize audio manager for volume gestures
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            
            // Fullscreen
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            // Root
            root = new FrameLayout(this);
            root.setBackgroundColor(0xFF000000);
            setContentView(root);

            // Apply immersive mode after decor view exists.
            applyImmersiveModeSafely();

            // ExoPlayer view with premium settings
            playerView = new PlayerView(this);
            playerView.setBackgroundColor(Color.BLACK);
            playerView.setUseController(true);
            playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER); // We'll use custom loading
            playerView.setControllerAutoShow(true);
            playerView.setControllerShowTimeoutMs(AUTO_HIDE_DELAY_MS);
            
            FrameLayout.LayoutParams playerParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
            root.addView(playerView, playerParams);

            // Create premium loading overlay
            createLoadingOverlay();
            
            // Create gesture indicator for volume/brightness
            createGestureIndicator();

            // Set up gestures (double-tap seek + swipe volume/brightness)
            setupGestures();
            
            // Create seek indicator overlays
            createSeekIndicators();

            // Store intent for diagnostics
            launchIntent = getIntent();
            
            // Intent data
            videoUri = launchIntent != null ? launchIntent.getData() : null;
            videoMimeType = launchIntent != null ? launchIntent.getType() : "video/*";
            if (videoMimeType == null || videoMimeType.isEmpty()) {
                videoMimeType = "video/*";
            }
            
            // Extract video title
            extractVideoTitle();
            
            // Log intent diagnostics
            logIntentDiagnostics(launchIntent);
            
            logInfo("URI: " + (videoUri != null ? videoUri.toString() : "null"));
            logInfo("MIME type: " + videoMimeType);
            logInfo("Scheme: " + (videoUri != null ? videoUri.getScheme() : "null"));
            
            // Log additional URI details
            if (videoUri != null) {
                logUriDetails(videoUri);
            }

            if (videoUri == null) {
                logError("No video URI provided");
                Toast.makeText(this, "No video to play", Toast.LENGTH_SHORT).show();
                finish();
                return;
            }

            // Check permissions for content URI
            checkUriPermissions(videoUri);

            // Create premium top bar with close button and title
            createTopBar();

            // Initialize ExoPlayer
            initializePlayer();
            
            // Schedule initial hide
            scheduleHide();
        } catch (Throwable t) {
            handleFatalInitError("onCreate failed", t);
        }
    }
    
    /**
     * Extract video title - prioritize shortcut name from intent, fallback to URI
     */
    private void extractVideoTitle() {
        // First, check if a shortcut title was passed via intent
        if (launchIntent != null) {
            String shortcutTitle = launchIntent.getStringExtra("shortcut_title");
            if (shortcutTitle != null && !shortcutTitle.isEmpty()) {
                videoTitle = shortcutTitle;
                logInfo("Using shortcut title: " + videoTitle);
                // Truncate if too long
                if (videoTitle.length() > 40) {
                    videoTitle = videoTitle.substring(0, 37) + "...";
                }
                return;
            }
        }
        
        // Fallback: extract from URI
        if (videoUri == null) return;
        
        try {
            if ("content".equals(videoUri.getScheme())) {
                try (Cursor cursor = getContentResolver().query(videoUri, null, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (nameIndex >= 0) {
                            videoTitle = cursor.getString(nameIndex);
                        }
                    }
                }
            } else {
                String path = videoUri.getLastPathSegment();
                if (path != null) {
                    videoTitle = path;
                }
            }
            
            // Clean up title
            if (videoTitle != null && videoTitle.length() > 40) {
                videoTitle = videoTitle.substring(0, 37) + "...";
            }
        } catch (Exception e) {
            logWarn("Could not extract video title: " + e.getMessage());
        }
    }
    
    /**
     * Create premium loading overlay with pulsing animation
     */
    private void createLoadingOverlay() {
        loadingOverlay = new FrameLayout(this);
        loadingOverlay.setBackgroundColor(0x99000000);
        loadingOverlay.setVisibility(View.VISIBLE);
        
        // Create loading container
        LinearLayout loadingContainer = new LinearLayout(this);
        loadingContainer.setOrientation(LinearLayout.VERTICAL);
        loadingContainer.setGravity(Gravity.CENTER);
        
        // Premium spinner with circular style
        ProgressBar spinner = new ProgressBar(this, null, android.R.attr.progressBarStyleLarge);
        spinner.getIndeterminateDrawable().setColorFilter(0xFFFFFFFF, android.graphics.PorterDuff.Mode.SRC_IN);
        
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dpToPx(56), dpToPx(56));
        spinnerParams.gravity = Gravity.CENTER;
        loadingContainer.addView(spinner, spinnerParams);
        
        // Loading text
        TextView loadingText = new TextView(this);
        loadingText.setText("Loading...");
        loadingText.setTextColor(0xBBFFFFFF);
        loadingText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        loadingText.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        loadingText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        textParams.topMargin = dpToPx(16);
        loadingContainer.addView(loadingText, textParams);
        
        FrameLayout.LayoutParams containerParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER
        );
        loadingOverlay.addView(loadingContainer, containerParams);
        
        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(loadingOverlay, overlayParams);
        
        // Pulse animation for loading text
        loadingAnimator = ObjectAnimator.ofFloat(loadingText, "alpha", 0.5f, 1f);
        loadingAnimator.setDuration(800);
        loadingAnimator.setRepeatMode(ValueAnimator.REVERSE);
        loadingAnimator.setRepeatCount(ValueAnimator.INFINITE);
        loadingAnimator.start();
    }
    
    private void hideLoadingOverlay() {
        if (loadingOverlay != null && loadingOverlay.getVisibility() == View.VISIBLE) {
            loadingOverlay.animate()
                .alpha(0f)
                .setDuration(300)
                .withEndAction(() -> {
                    loadingOverlay.setVisibility(View.GONE);
                    if (loadingAnimator != null) {
                        loadingAnimator.cancel();
                    }
                })
                .start();
        }
    }
    
    /**
     * Create gesture indicator for volume/brightness feedback
     */
    private void createGestureIndicator() {
        gestureIndicator = new TextView(this);
        gestureIndicator.setTextColor(Color.WHITE);
        gestureIndicator.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        gestureIndicator.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        gestureIndicator.setGravity(Gravity.CENTER);
        gestureIndicator.setPadding(dpToPx(24), dpToPx(16), dpToPx(24), dpToPx(16));
        gestureIndicator.setVisibility(View.GONE);
        
        // Premium frosted glass pill
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dpToPx(28));
        bg.setColor(0x99000000);
        bg.setStroke(dpToPx(1), 0x33FFFFFF);
        gestureIndicator.setBackground(bg);
        gestureIndicator.setElevation(dpToPx(8));
        
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER
        );
        root.addView(gestureIndicator, params);
    }

    /**
     * Set up comprehensive gestures: double-tap seek + swipe volume/brightness
     */
    private void setupGestures() {
        gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDoubleTap(MotionEvent e) {
                if (exoPlayer == null || isInPipMode || isControlsLocked) return false;
                
                float x = e.getX();
                float screenWidth = playerView.getWidth();
                
                if (screenWidth <= 0) return false;
                
                // Haptic feedback
                performHapticFeedback();
                
                if (x < screenWidth / 2) {
                    seekByDoubleTap(-DOUBLE_TAP_SEEK_MS, true);
                } else {
                    seekByDoubleTap(DOUBLE_TAP_SEEK_MS, false);
                }
                
                return true;
            }

            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                if (isControlsLocked) {
                    // When locked, toggle the floating unlock button visibility
                    toggleFloatingUnlockButton();
                } else {
                    toggleTopBar();
                }
                return true;
            }

            @Override
            public boolean onDown(MotionEvent e) {
                return true;
            }
            
            @Override
            public boolean onScroll(MotionEvent e1, MotionEvent e2, float distanceX, float distanceY) {
                if (e1 == null || isInPipMode || isControlsLocked) return false;
                
                float x = e1.getX();
                float screenWidth = playerView.getWidth();
                float screenHeight = playerView.getHeight();
                
                // Only activate for vertical swipes
                if (Math.abs(distanceY) > Math.abs(distanceX) * 1.5f) {
                    if (!isSwipeGestureActive) {
                        // Determine if this is volume (right) or brightness (left)
                        isVolumeGesture = x > screenWidth / 2;
                        initialTouchY = e1.getY();
                        
                        if (isVolumeGesture) {
                            initialVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
                        } else {
                            initialBrightness = getScreenBrightness();
                        }
                        isSwipeGestureActive = true;
                    }
                    
                    // Calculate change based on swipe distance
                    float deltaY = initialTouchY - e2.getY();
                    float percentChange = deltaY / (screenHeight * 0.5f);
                    
                    if (isVolumeGesture) {
                        handleVolumeGesture(percentChange);
                    } else {
                        handleBrightnessGesture(percentChange);
                    }
                    
                    return true;
                }
                
                return false;
            }
        });

        playerView.setOnTouchListener((v, event) -> {
            gestureDetector.onTouchEvent(event);
            
            // Reset swipe gesture on touch up
            if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                if (isSwipeGestureActive) {
                    isSwipeGestureActive = false;
                    hideGestureIndicator();
                }
            }
            
            return false;
        });
    }
    
    private void handleVolumeGesture(float percentChange) {
        int newVolume = (int) (initialVolume + percentChange * maxVolume);
        newVolume = Math.max(0, Math.min(maxVolume, newVolume));
        
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, newVolume, 0);
        
        int volumePercent = (int) ((newVolume / (float) maxVolume) * 100);
        showGestureIndicator("🔊  " + volumePercent + "%");
    }
    
    private void handleBrightnessGesture(float percentChange) {
        float newBrightness = initialBrightness + percentChange;
        newBrightness = Math.max(0.01f, Math.min(1f, newBrightness));
        
        WindowManager.LayoutParams layoutParams = getWindow().getAttributes();
        layoutParams.screenBrightness = newBrightness;
        getWindow().setAttributes(layoutParams);
        
        int brightnessPercent = (int) (newBrightness * 100);
        showGestureIndicator("☀️  " + brightnessPercent + "%");
    }
    
    private float getScreenBrightness() {
        WindowManager.LayoutParams layoutParams = getWindow().getAttributes();
        if (layoutParams.screenBrightness < 0) {
            try {
                return Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS) / 255f;
            } catch (Settings.SettingNotFoundException e) {
                return 0.5f;
            }
        }
        return layoutParams.screenBrightness;
    }
    
    private void showGestureIndicator(String text) {
        if (gestureIndicator == null) return;
        
        gestureIndicator.setText(text);
        gestureIndicator.setVisibility(View.VISIBLE);
        gestureIndicator.setAlpha(1f);
    }
    
    private void hideGestureIndicator() {
        if (gestureIndicator == null) return;
        
        gestureIndicator.animate()
            .alpha(0f)
            .setDuration(300)
            .withEndAction(() -> gestureIndicator.setVisibility(View.GONE))
            .start();
    }
    
    private void performHapticFeedback() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    vibrator.vibrate(VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE));
                }
            }
        } catch (Exception ignored) {}
    }
    
    private void toggleControlsLock() {
        isControlsLocked = !isControlsLocked;
        
        if (lockButton != null) {
            lockButton.setImageResource(isControlsLocked 
                ? android.R.drawable.ic_lock_lock 
                : android.R.drawable.ic_lock_idle_lock);
            
            // Animation feedback
            lockButton.animate()
                .scaleX(1.2f).scaleY(1.2f)
                .setDuration(100)
                .withEndAction(() -> lockButton.animate().scaleX(1f).scaleY(1f).setDuration(100).start())
                .start();
        }
        
        if (isControlsLocked) {
            hideTopBar();
            playerView.setUseController(false);
            // Show lock state indicator in corner
            showLockStateIndicator();
            // Show floating unlock button briefly, then hide after delay
            showFloatingUnlockButton();
            hideHandler.postDelayed(this::hideFloatingUnlockButton, AUTO_HIDE_DELAY_MS);
        } else {
            // Hide lock state indicator and floating unlock button
            hideLockStateIndicator();
            hideFloatingUnlockButton();
            showTopBar();
            scheduleHide();
            playerView.setUseController(true);
        }
    }
    
    /**
     * Create the persistent lock state indicator (small lock icon in corner).
     */
    private void createLockStateIndicator() {
        lockStateIndicator = new ImageView(this);
        lockStateIndicator.setImageResource(android.R.drawable.ic_lock_lock);
        lockStateIndicator.setColorFilter(Color.WHITE);
        lockStateIndicator.setVisibility(View.GONE);
        lockStateIndicator.setAlpha(0f);
        
        // Small pill background
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dpToPx(16));
        bg.setColor(0x66000000);
        bg.setStroke(dpToPx(1), 0x33FFFFFF);
        lockStateIndicator.setBackground(bg);
        lockStateIndicator.setPadding(dpToPx(8), dpToPx(8), dpToPx(8), dpToPx(8));
        lockStateIndicator.setElevation(dpToPx(4));
        
        // Position in top-right corner
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(dpToPx(36), dpToPx(36));
        params.gravity = Gravity.TOP | Gravity.END;
        params.topMargin = dpToPx(120); // Below top bar area
        params.rightMargin = dpToPx(16);
        
        root.addView(lockStateIndicator, params);
    }
    
    /**
     * Show the lock state indicator with animation.
     */
    private void showLockStateIndicator() {
        if (lockStateIndicator == null) {
            createLockStateIndicator();
        }
        
        lockStateIndicator.setVisibility(View.VISIBLE);
        lockStateIndicator.animate()
            .alpha(0.8f)
            .setDuration(300)
            .start();
    }
    
    /**
     * Hide the lock state indicator with animation.
     */
    private void hideLockStateIndicator() {
        if (lockStateIndicator == null) return;
        
        lockStateIndicator.animate()
            .alpha(0f)
            .setDuration(200)
            .withEndAction(() -> {
                if (lockStateIndicator != null) {
                    lockStateIndicator.setVisibility(View.GONE);
                }
            })
            .start();
    }
    
    /**
     * Toggle floating unlock button visibility when screen is tapped while locked.
     */
    private void toggleFloatingUnlockButton() {
        if (floatingUnlockContainer == null) return;
        
        if (floatingUnlockContainer.getVisibility() == View.VISIBLE && floatingUnlockContainer.getAlpha() > 0) {
            hideFloatingUnlockButton();
        } else {
            showFloatingUnlockButton();
            // Auto-hide after delay
            hideHandler.removeCallbacks(this::hideFloatingUnlockButton);
            hideHandler.postDelayed(this::hideFloatingUnlockButton, AUTO_HIDE_DELAY_MS);
        }
    }
    
    /**
     * Show the floating unlock button with animation and pulsing effect.
     */
    private void showFloatingUnlockButton() {
        if (floatingUnlockContainer == null) return;
        
        floatingUnlockContainer.setVisibility(View.VISIBLE);
        floatingUnlockContainer.animate()
            .alpha(1f)
            .setDuration(250)
            .setInterpolator(new OvershootInterpolator())
            .start();
        
        // Start pulsing animation
        startFloatingUnlockPulse();
    }
    
    /**
     * Hide the floating unlock button with animation.
     */
    private void hideFloatingUnlockButton() {
        if (floatingUnlockContainer == null) return;
        
        // Stop pulsing animation
        stopFloatingUnlockPulse();
        
        floatingUnlockContainer.animate()
            .alpha(0f)
            .setDuration(200)
            .withEndAction(() -> {
                if (floatingUnlockContainer != null) {
                    floatingUnlockContainer.setVisibility(View.GONE);
                }
            })
            .start();
    }

    private void initializePlayer() {
        logInfo("Initializing ExoPlayer...");
        
        // Check HDR display capability first
        checkHdrDisplaySupport();
        
        try {
            // Create ExoPlayer with default configuration
            // ExoPlayer automatically handles HDR when the device and content support it
            exoPlayer = new ExoPlayer.Builder(this).build();
            
            if (exoPlayer == null) {
                logError("ExoPlayer.Builder returned null");
                showExternalPlayerDialog("Failed to create video player");
                return;
            }
            
            playerView.setPlayer(exoPlayer);
            logInfo("ExoPlayer created successfully");
            
            // Set up listener
            exoPlayer.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    String state = getPlaybackStateString();
                    logInfo("Playback state: " + state);
                    
                    if (playbackState == Player.STATE_READY) {
                        hideLoadingOverlay();
                        showTopBar();
                        scheduleHide();
                        // Check video format for HDR info
                        detectHdrFromCurrentTrack();
                    } else if (playbackState == Player.STATE_BUFFERING) {
                        // Could show loading again for rebuffering if desired
                    } else if (playbackState == Player.STATE_ENDED) {
                        logInfo("Playback completed");
                        showTopBar();
                    }
                    
                    updateDebugOverlay();
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    String errorCode = getErrorCodeString(error.errorCode);
                    String cause = error.getCause() != null ? error.getCause().getMessage() : "unknown";
                    logError("Playback error: " + errorCode + " - " + error.getMessage() + " (cause: " + cause + ")");
                    
                    showExternalPlayerDialog("Unable to play video: " + error.getMessage());
                }

                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    logInfo("isPlaying: " + isPlaying);
                    // Update PiP controls when play state changes
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isInPipMode) {
                        updatePipParams();
                    }
                }

                @Override
                public void onVideoSizeChanged(VideoSize videoSize) {
                    logInfo("Video size: " + videoSize.width + "x" + videoSize.height);
                    // Store video dimensions for PiP aspect ratio
                    if (videoSize.width > 0 && videoSize.height > 0) {
                        videoWidth = videoSize.width;
                        videoHeight = videoSize.height;
                        
                        // Auto-rotate: lock orientation based on video aspect ratio
                        lockOrientationBasedOnAspectRatio(videoSize.width, videoSize.height);
                        
                        // Enable auto-enter PiP on Android 12+ now that we have video dimensions
                        setupAutoEnterPip();
                    }
                }
            });

            // Create media item and start playback
            logInfo("Setting media URI: " + videoUri);
            MediaItem mediaItem = MediaItem.fromUri(videoUri);
            exoPlayer.setMediaItem(mediaItem);
            
            logInfo("Preparing playback...");
            exoPlayer.prepare();
            exoPlayer.setPlayWhenReady(true);
            
            logInfo("Playback initiated");
            
        } catch (Throwable t) {
            handleFatalInitError("ExoPlayer init failed", t);
        }
    }

    /**
     * Check if the device display supports HDR content.
     */
    private void checkHdrDisplaySupport() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Display display = getWindowManager().getDefaultDisplay();
                Display.HdrCapabilities hdrCaps = display.getHdrCapabilities();
                
                if (hdrCaps != null) {
                    int[] supportedTypes = hdrCaps.getSupportedHdrTypes();
                    isHdrDisplaySupported = supportedTypes != null && supportedTypes.length > 0;
                    
                    if (isHdrDisplaySupported) {
                        StringBuilder sb = new StringBuilder();
                        for (int type : supportedTypes) {
                            if (sb.length() > 0) sb.append(", ");
                            sb.append(getHdrTypeName(type));
                        }
                        logInfo("HDR display supported: " + sb.toString());
                        logInfo("HDR max luminance: " + hdrCaps.getDesiredMaxLuminance() + " nits");
                    } else {
                        logInfo("HDR display: not supported");
                    }
                } else {
                    logInfo("HDR capabilities: unavailable");
                }
            } else {
                logInfo("HDR detection requires Android O+");
            }
        } catch (Exception e) {
            logWarn("Failed to check HDR display support: " + e.getMessage());
        }
    }

    /**
     * Detect HDR information from the currently playing video track.
     */
    private void detectHdrFromCurrentTrack() {
        try {
            if (exoPlayer == null) return;
            
            Format videoFormat = exoPlayer.getVideoFormat();
            if (videoFormat == null) {
                logInfo("Video format not available yet");
                return;
            }
            
            ColorInfo colorInfo = videoFormat.colorInfo;
            if (colorInfo != null) {
                // Detect HDR type from color transfer
                int colorTransferVal = colorInfo.colorTransfer;
                int colorSpaceVal = colorInfo.colorSpace;
                
                colorTransfer = getColorTransferName(colorTransferVal);
                colorSpace = getColorSpaceName(colorSpaceVal);
                
                // Check for HDR content
                if (colorTransferVal == C.COLOR_TRANSFER_ST2084) {
                    // PQ (Perceptual Quantizer) - used by HDR10, HDR10+, Dolby Vision
                    isHdrContent = true;
                    if (videoFormat.codecs != null && videoFormat.codecs.contains("dvh")) {
                        hdrType = "Dolby Vision";
                    } else {
                        hdrType = "HDR10/HDR10+";
                    }
                } else if (colorTransferVal == C.COLOR_TRANSFER_HLG) {
                    // HLG (Hybrid Log-Gamma)
                    isHdrContent = true;
                    hdrType = "HLG";
                } else {
                    isHdrContent = false;
                    hdrType = "SDR";
                }
                
                logInfo("Color info - Transfer: " + colorTransfer + ", Space: " + colorSpace);
                logInfo("HDR content: " + hdrType + (isHdrContent ? " ✓" : ""));
                
                // Log if HDR playback is actually happening
                if (isHdrContent) {
                    if (isHdrDisplaySupported) {
                        logInfo("HDR playback: ACTIVE (device supports HDR)");
                    } else {
                        logWarn("HDR content detected but display doesn't support HDR - tonemapping to SDR");
                    }
                }
            } else {
                hdrType = "SDR";
                colorSpace = "default";
                colorTransfer = "default";
                isHdrContent = false;
                logInfo("No color info in video format (SDR content)");
            }
            
            // Log codec info
            if (videoFormat.codecs != null) {
                logInfo("Codec: " + videoFormat.codecs);
            }
            if (videoFormat.sampleMimeType != null) {
                logInfo("Sample MIME: " + videoFormat.sampleMimeType);
            }
            
            updateDebugOverlay();
            
        } catch (Exception e) {
            logWarn("Failed to detect HDR info: " + e.getMessage());
        }
    }

    private String getHdrTypeName(int hdrType) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            switch (hdrType) {
                case Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION:
                    return "Dolby Vision";
                case Display.HdrCapabilities.HDR_TYPE_HDR10:
                    return "HDR10";
                case Display.HdrCapabilities.HDR_TYPE_HLG:
                    return "HLG";
                case Display.HdrCapabilities.HDR_TYPE_HDR10_PLUS:
                    return "HDR10+";
                default:
                    return "Unknown(" + hdrType + ")";
            }
        }
        return "Unknown";
    }

    private String getColorTransferName(int colorTransfer) {
        switch (colorTransfer) {
            case C.COLOR_TRANSFER_SDR:
                return "SDR";
            case C.COLOR_TRANSFER_ST2084:
                return "PQ (ST2084)";
            case C.COLOR_TRANSFER_HLG:
                return "HLG";
            case C.COLOR_TRANSFER_LINEAR:
                return "Linear";
            case C.COLOR_TRANSFER_GAMMA_2_2:
                return "Gamma 2.2";
            default:
                return "Unknown(" + colorTransfer + ")";
        }
    }

    private String getColorSpaceName(int colorSpace) {
        switch (colorSpace) {
            case C.COLOR_SPACE_BT709:
                return "BT.709 (SDR)";
            case C.COLOR_SPACE_BT601:
                return "BT.601";
            case C.COLOR_SPACE_BT2020:
                return "BT.2020 (HDR)";
            default:
                return "Unknown(" + colorSpace + ")";
        }
    }

    private String getErrorCodeString(int errorCode) {
        switch (errorCode) {
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED:
                return "NETWORK_CONNECTION_FAILED";
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT:
                return "NETWORK_TIMEOUT";
            case PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND:
                return "FILE_NOT_FOUND";
            case PlaybackException.ERROR_CODE_IO_NO_PERMISSION:
                return "NO_PERMISSION";
            case PlaybackException.ERROR_CODE_IO_UNSPECIFIED:
                return "IO_UNSPECIFIED";
            case PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED:
                return "CONTAINER_UNSUPPORTED";
            case PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED:
                return "MANIFEST_UNSUPPORTED";
            case PlaybackException.ERROR_CODE_DECODER_INIT_FAILED:
                return "DECODER_INIT_FAILED";
            case PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED:
                return "DECODER_QUERY_FAILED";
            case PlaybackException.ERROR_CODE_DECODING_FAILED:
                return "DECODING_FAILED";
            case PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED:
                return "AUDIO_TRACK_INIT_FAILED";
            case PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED:
                return "AUDIO_TRACK_WRITE_FAILED";
            default:
                return "ERROR_" + errorCode;
        }
    }

    private void logUriDetails(Uri uri) {
        try {
            String scheme = uri.getScheme();
            
            if ("content".equals(scheme)) {
                // Try to get file info from content resolver
                ContentResolver resolver = getContentResolver();
                String mimeFromResolver = resolver.getType(uri);
                logInfo("ContentResolver MIME: " + (mimeFromResolver != null ? mimeFromResolver : "null"));
                
                try (android.database.Cursor cursor = resolver.query(uri, null, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        // Get display name
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (nameIndex >= 0) {
                            String displayName = cursor.getString(nameIndex);
                            logInfo("File name: " + displayName);
                        }
                        
                        // Get size
                        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                            long size = cursor.getLong(sizeIndex);
                            logInfo("File size: " + formatFileSize(size));
                        }
                    }
                } catch (Exception e) {
                    logWarn("Failed to query URI details: " + e.getMessage());
                }
            } else if ("file".equals(scheme)) {
                String path = uri.getPath();
                logInfo("File path: " + path);
            }
        } catch (Exception e) {
            logWarn("Failed to log URI details: " + e.getMessage());
        }
    }

    private void checkUriPermissions(Uri uri) {
        try {
            String scheme = uri.getScheme();
            
            if ("content".equals(scheme)) {
                // Check if we have read permission
                int permissionCheck = checkUriPermission(
                    uri,
                    android.os.Process.myPid(),
                    android.os.Process.myUid(),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
                
                boolean hasPermission = (permissionCheck == PackageManager.PERMISSION_GRANTED);
                logInfo("URI read permission: " + (hasPermission ? "GRANTED" : "DENIED"));
                
                if (!hasPermission) {
                    logWarn("May need to request URI permission");
                }
            } else {
                logInfo("Non-content URI, no permission check needed");
            }
        } catch (Exception e) {
            logWarn("Permission check failed: " + e.getMessage());
        }
    }

    private String formatFileSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format(Locale.US, "%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024));
        return String.format(Locale.US, "%.1f GB", bytes / (1024.0 * 1024 * 1024));
    }

    private void createTopBar() {
        // Top bar container with premium cinematic gradient
        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dpToPx(16), dpToPx(20), dpToPx(16), dpToPx(16));
        
        // Premium 4-stop gradient for cinematic depth
        GradientDrawable gradient = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0xE6000000, 0xB3000000, 0x4D000000, 0x00000000}
        );
        topBar.setBackground(gradient);

        FrameLayout.LayoutParams topBarParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpToPx(110),
            Gravity.TOP
        );
        root.addView(topBar, topBarParams);

        // Close button (left side)
        closeButton = createPremiumIconButton(
            android.R.drawable.ic_menu_close_clear_cancel,
            "Close"
        );
        closeButton.setOnClickListener(v -> {
            performHapticFeedback();
            exitPlayerAndApp();
        });
        topBar.addView(closeButton);
        
        // Title container (takes remaining space)
        LinearLayout titleContainer = new LinearLayout(this);
        titleContainer.setOrientation(LinearLayout.VERTICAL);
        titleContainer.setGravity(Gravity.CENTER_VERTICAL);
        titleContainer.setPadding(dpToPx(12), 0, dpToPx(12), 0);
        
        LinearLayout.LayoutParams titleContainerParams = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
        );
        topBar.addView(titleContainer, titleContainerParams);
        
        // Video title
        titleView = new TextView(this);
        titleView.setText(videoTitle != null && !videoTitle.isEmpty() ? videoTitle : "Video");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        titleView.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        titleView.setMaxLines(1);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        titleContainer.addView(titleView);
        
        // Subtitle (HDR badge if applicable)
        if (isHdrContent) {
            TextView hdrBadge = new TextView(this);
            hdrBadge.setText("HDR");
            hdrBadge.setTextColor(0xFFFFD700);
            hdrBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
            hdrBadge.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
            LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            );
            badgeParams.topMargin = dpToPx(2);
            titleContainer.addView(hdrBadge, badgeParams);
        }
        
        // Right side buttons container
        LinearLayout rightButtons = new LinearLayout(this);
        rightButtons.setOrientation(LinearLayout.HORIZONTAL);
        rightButtons.setGravity(Gravity.CENTER_VERTICAL);
        topBar.addView(rightButtons);
        
        // Lock button
        lockButton = createPremiumIconButton(
            android.R.drawable.ic_lock_idle_lock,
            "Lock controls"
        );
        lockButton.setOnClickListener(v -> toggleControlsLock());
        rightButtons.addView(lockButton);
        
        // Rotation toggle button
        ImageButton rotateButton = createPremiumIconButton(
            android.R.drawable.ic_menu_rotate,
            "Toggle orientation"
        );
        rotateButton.setOnClickListener(v -> {
            performHapticFeedback();
            toggleOrientation();
        });
        rightButtons.addView(rotateButton);
        
        // PiP button (Picture-in-Picture) - only on Android 8.0+ and if enabled in settings
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isPipEnabled) {
            ImageButton pipButton = createPremiumIconButton(
                android.R.drawable.ic_menu_crop,
                "Picture-in-Picture"
            );
            pipButton.setOnClickListener(v -> {
                performHapticFeedback();
                enterPipMode();
            });
            rightButtons.addView(pipButton);
        }

        // "Open with" button
        ImageButton openWithButton = createPremiumIconButton(
            android.R.drawable.ic_menu_share,
            "Open with another app"
        );
        openWithButton.setOnClickListener(v -> {
            performHapticFeedback();
            openInExternalPlayerDirect();
        });
        rightButtons.addView(openWithButton);
        
        // Create floating unlock button (hidden initially)
        createFloatingUnlockButton();
    }
    
    /**
     * Create a floating unlock button that appears when controls are locked.
     * This provides a way to unlock controls even when the top bar is hidden.
     */
    private void createFloatingUnlockButton() {
        // Create container for button + label
        floatingUnlockContainer = new LinearLayout(this);
        floatingUnlockContainer.setOrientation(LinearLayout.VERTICAL);
        floatingUnlockContainer.setGravity(Gravity.CENTER);
        floatingUnlockContainer.setVisibility(View.GONE);
        floatingUnlockContainer.setAlpha(0f);
        
        // Unlock button - 72dp for better tapping
        floatingUnlockButton = new ImageButton(this);
        floatingUnlockButton.setImageResource(android.R.drawable.ic_lock_idle_lock); // Open lock icon
        floatingUnlockButton.setContentDescription("Tap to unlock controls");
        floatingUnlockButton.setColorFilter(Color.WHITE);
        
        // Premium glassmorphism style with enhanced visibility
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0x80000000); // 50% black for better contrast
        bg.setStroke(dpToPx(2), 0x66FFFFFF); // Stronger border
        floatingUnlockButton.setBackground(bg);
        floatingUnlockButton.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        floatingUnlockButton.setPadding(dpToPx(18), dpToPx(18), dpToPx(18), dpToPx(18));
        floatingUnlockButton.setElevation(dpToPx(12));
        
        // 72dp size for reliable tapping
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(dpToPx(72), dpToPx(72));
        floatingUnlockContainer.addView(floatingUnlockButton, buttonParams);
        
        // Label below button
        floatingUnlockLabel = new TextView(this);
        floatingUnlockLabel.setText("Tap to unlock");
        floatingUnlockLabel.setTextColor(0xCCFFFFFF);
        floatingUnlockLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        floatingUnlockLabel.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        floatingUnlockLabel.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        labelParams.topMargin = dpToPx(8);
        floatingUnlockContainer.addView(floatingUnlockLabel, labelParams);
        
        // Position container at bottom center, higher up to avoid bottom controls
        FrameLayout.LayoutParams containerParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        );
        containerParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        containerParams.bottomMargin = dpToPx(100);
        
        floatingUnlockButton.setOnClickListener(v -> {
            performHapticFeedback();
            toggleControlsLock();
        });
        
        // Enhanced touch feedback animation
        floatingUnlockButton.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    v.animate().scaleX(0.85f).scaleY(0.85f).setDuration(80).start();
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    v.animate().scaleX(1f).scaleY(1f).setDuration(100)
                        .setInterpolator(new OvershootInterpolator(1.3f)).start();
                    break;
            }
            return false;
        });
        
        root.addView(floatingUnlockContainer, containerParams);
    }
    
    // Pulsing animation for floating unlock button
    private ValueAnimator floatingUnlockPulseAnimator;
    
    private void startFloatingUnlockPulse() {
        if (floatingUnlockPulseAnimator != null) {
            floatingUnlockPulseAnimator.cancel();
        }
        
        floatingUnlockPulseAnimator = ValueAnimator.ofFloat(1f, 1.08f, 1f);
        floatingUnlockPulseAnimator.setDuration(1200);
        floatingUnlockPulseAnimator.setRepeatCount(ValueAnimator.INFINITE);
        floatingUnlockPulseAnimator.setInterpolator(new AccelerateDecelerateInterpolator());
        floatingUnlockPulseAnimator.addUpdateListener(animation -> {
            float scale = (float) animation.getAnimatedValue();
            if (floatingUnlockButton != null) {
                floatingUnlockButton.setScaleX(scale);
                floatingUnlockButton.setScaleY(scale);
            }
        });
        floatingUnlockPulseAnimator.start();
    }
    
    private void stopFloatingUnlockPulse() {
        if (floatingUnlockPulseAnimator != null) {
            floatingUnlockPulseAnimator.cancel();
            floatingUnlockPulseAnimator = null;
        }
        if (floatingUnlockButton != null) {
            floatingUnlockButton.setScaleX(1f);
            floatingUnlockButton.setScaleY(1f);
        }
    }

    private TextView createSpeedButton() {
        TextView button = new TextView(this);
        button.setText(getSpeedLabel(PLAYBACK_SPEEDS[currentSpeedIndex]));
        button.setTextColor(Color.WHITE);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setGravity(Gravity.CENTER);
        button.setPadding(dpToPx(14), dpToPx(6), dpToPx(14), dpToPx(6));
        button.setContentDescription("Playback speed");
        
        // Premium frosted glass pill
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dpToPx(18));
        bg.setColor(0x33FFFFFF);
        bg.setStroke(dpToPx(1), 0x22FFFFFF);
        button.setBackground(bg);
        
        return button;
    }

    private ImageButton createPremiumIconButton(int iconResId, String contentDescription) {
        ImageButton button = new ImageButton(this);
        button.setImageResource(iconResId);
        button.setContentDescription(contentDescription);
        button.setColorFilter(Color.WHITE);
        
        // Premium glassmorphism circle with enhanced visibility
        // Larger size (52dp) and stronger border (2dp) for better touch targets
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0x4DFFFFFF); // 30% white - slightly more visible
        bg.setStroke(dpToPx(2), 0x40FFFFFF); // 2dp border, 25% white
        button.setBackground(bg);
        button.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        button.setPadding(dpToPx(14), dpToPx(14), dpToPx(14), dpToPx(14)); // Larger padding
        button.setElevation(dpToPx(6));
        
        // Larger touch targets: 52dp instead of 46dp
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dpToPx(52), dpToPx(52));
        params.setMargins(dpToPx(4), 0, dpToPx(4), 0);
        button.setLayoutParams(params);
        
        // Enhanced touch feedback animation with stronger scale
        button.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    v.animate().scaleX(0.85f).scaleY(0.85f).setDuration(80).start();
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    v.animate().scaleX(1f).scaleY(1f).setDuration(100)
                        .setInterpolator(new OvershootInterpolator(1.2f)).start();
                    break;
            }
            return false;
        });
        
        return button;
    }

    private String getSpeedLabel(float speed) {
        if (speed == (int) speed) {
            return String.format(Locale.US, "%dx", (int) speed);
        } else if (speed * 10 == (int) (speed * 10)) {
            return String.format(Locale.US, "%.1fx", speed);
        } else {
            return String.format(Locale.US, "%.2fx", speed);
        }
    }

    private void cyclePlaybackSpeed() {
        currentSpeedIndex = (currentSpeedIndex + 1) % PLAYBACK_SPEEDS.length;
        float newSpeed = PLAYBACK_SPEEDS[currentSpeedIndex];
        
        if (exoPlayer != null) {
            exoPlayer.setPlaybackSpeed(newSpeed);
            logInfo("Playback speed: " + getSpeedLabel(newSpeed));
        }
        
        if (speedButton != null) {
            speedButton.setText(getSpeedLabel(newSpeed));
            
            // Brief scale animation for feedback
            speedButton.animate()
                .scaleX(1.2f).scaleY(1.2f)
                .setDuration(100)
                .withEndAction(() -> 
                    speedButton.animate()
                        .scaleX(1f).scaleY(1f)
                        .setDuration(100)
                        .start()
                )
                .start();
        }
        
        // Reset auto-hide timer
        scheduleHide();
    }

    private void logIntentDiagnostics(Intent intent) {
        logInfo("=== INTENT DIAGNOSTICS ===");
        if (intent == null) {
            logError("Intent is NULL");
            return;
        }
        logInfo("Action: " + (intent.getAction() != null ? intent.getAction() : "null"));
        logInfo("Data: " + (intent.getData() != null ? intent.getData().toString() : "null"));
        logInfo("Type: " + (intent.getType() != null ? intent.getType() : "null"));
        logInfo("Flags: 0x" + Integer.toHexString(intent.getFlags()));
    }

    private void showErrorAndFinish(String message) {
        try {
            Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        } catch (Exception ignored) {}
        finish();
    }

    /**
     * Handle fatal initialization errors with full diagnostics.
     * Shows a dialog with options to copy error details or open in external player.
     */
    private void handleFatalInitError(String context, Throwable t) {
        // Always log full stack trace to logcat
        Log.e(TAG, context + " - Fatal error", t);
        
        // Build detailed error info
        String errorDetails = buildErrorDetails(context, t);
        
        // Try to show our debug logs for context
        try {
            logError(context + ": " + t.getClass().getSimpleName() + " - " + t.getMessage());
        } catch (Throwable ignored) {}
        
        // Show dialog with options
        try {
            runOnUiThread(() -> {
                try {
                    String message = t.getClass().getSimpleName() + ":\n" + t.getMessage();
                    
                    new AlertDialog.Builder(this)
                        .setTitle("Video Player Error")
                        .setMessage(message)
                        .setPositiveButton("Open with...", (dialog, which) -> {
                            openInExternalPlayer();
                        })
                        .setNeutralButton("Copy Error", (dialog, which) -> {
                            copyToClipboard("Video Player Error", errorDetails);
                            Toast.makeText(this, "Error details copied!", Toast.LENGTH_SHORT).show();
                            finish();
                        })
                        .setNegativeButton("Close", (dialog, which) -> {
                            finish();
                        })
                        .setOnCancelListener(dialog -> finish())
                        .setCancelable(true)
                        .show();
                } catch (Throwable dialogError) {
                    Log.e(TAG, "Failed to show error dialog", dialogError);
                    showErrorAndFinish("Failed to initialize video player");
                }
            });
        } catch (Throwable uiError) {
            Log.e(TAG, "Failed to post to UI thread", uiError);
            showErrorAndFinish("Failed to initialize video player");
        }
    }

    private String buildErrorDetails(String context, Throwable t) {
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        t.printStackTrace(pw);
        
        StringBuilder sb = new StringBuilder();
        sb.append("=== VIDEO PLAYER ERROR ===\n\n");
        sb.append("Context: ").append(context).append("\n\n");
        
        sb.append("DEVICE:\n");
        sb.append("  Model: ").append(Build.MODEL).append("\n");
        sb.append("  Manufacturer: ").append(Build.MANUFACTURER).append("\n");
        sb.append("  Android: ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(")\n\n");
        
        sb.append("VIDEO:\n");
        sb.append("  URI: ").append(videoUri != null ? videoUri.toString() : "null").append("\n");
        sb.append("  Scheme: ").append(videoUri != null ? videoUri.getScheme() : "null").append("\n");
        sb.append("  MIME: ").append(videoMimeType).append("\n\n");
        
        sb.append("EXCEPTION:\n");
        sb.append("  Type: ").append(t.getClass().getName()).append("\n");
        sb.append("  Message: ").append(t.getMessage()).append("\n\n");
        
        sb.append("STACK TRACE:\n");
        sb.append(sw.toString()).append("\n\n");
        
        sb.append("DEBUG LOG:\n");
        for (String log : debugLogs) {
            sb.append("  ").append(log).append("\n");
        }
        
        return sb.toString();
    }

    private void copyToClipboard(String label, String text) {
        try {
            android.content.ClipboardManager clipboard = 
                (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (clipboard != null) {
                ClipData clip = ClipData.newPlainText(label, text);
                clipboard.setPrimaryClip(clip);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to copy to clipboard", e);
        }
    }

    /**
     * Opens video in external player directly without dialog.
     * Used when user taps the "Open with" button.
     */
    private void openInExternalPlayerDirect() {
        if (videoUri == null) {
            Toast.makeText(this, "No video to open", Toast.LENGTH_SHORT).show();
            return;
        }
        
        logInfo("Opening in external player (manual)");
        
        // Pause current playback
        if (exoPlayer != null) {
            try {
                exoPlayer.pause();
            } catch (Exception ignored) {}
        }
        
        try {
            Intent externalIntent = new Intent(Intent.ACTION_VIEW);
            externalIntent.setDataAndType(videoUri, videoMimeType);
            externalIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // Add ClipData for content URIs to ensure permission propagation
            if ("content".equals(videoUri.getScheme())) {
                try {
                    externalIntent.setClipData(ClipData.newUri(getContentResolver(), "video", videoUri));
                } catch (Exception e) {
                    logWarn("Failed to set ClipData: " + e.getMessage());
                }
            }
            
            // Create a chooser to let user pick the app
            Intent chooser = Intent.createChooser(externalIntent, "Open with...");
            startActivity(chooser);
            logInfo("External player launched");
            
            // Finish this activity after opening external player
            finish();
        } catch (ActivityNotFoundException e) {
            logError("No external player found: " + e.getMessage());
            Toast.makeText(this, "No video player app found", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            logError("External player error: " + e.getMessage());
            Toast.makeText(this, "Unable to open external player", Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Attempts to open the video in an external player app.
     * Shows a chooser dialog to let the user pick their preferred app.
     */
    private void openInExternalPlayer() {
        if (videoUri == null || hasTriedExternalFallback) {
            showErrorAndFinish("Unable to play video");
            return;
        }
        
        hasTriedExternalFallback = true;
        logInfo("Falling back to external player");
        releasePlayer();
        
        try {
            Intent externalIntent = new Intent(Intent.ACTION_VIEW);
            externalIntent.setDataAndType(videoUri, videoMimeType);
            externalIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // Add ClipData for content URIs to ensure permission propagation
            if ("content".equals(videoUri.getScheme())) {
                try {
                    externalIntent.setClipData(ClipData.newUri(getContentResolver(), "video", videoUri));
                } catch (Exception e) {
                    logWarn("Failed to set ClipData: " + e.getMessage());
                }
            }
            
            // Create a chooser to let user pick the app
            Intent chooser = Intent.createChooser(externalIntent, "Open with...");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
            startActivity(chooser);
            logInfo("External player launched (fallback)");
            finish();
        } catch (ActivityNotFoundException e) {
            logError("No external player found: " + e.getMessage());
            showErrorAndFinish("No video player app found");
        } catch (Exception e) {
            logError("External player error: " + e.getMessage());
            showErrorAndFinish("Unable to play video");
        }
    }

    /**
     * Shows a dialog asking the user if they want to try an external player.
     */
    private void showExternalPlayerDialog(String errorMessage) {
        if (hasTriedExternalFallback) {
            showErrorAndFinish(errorMessage);
            return;
        }
        
        logInfo("Showing external player dialog");
        
        try {
            new AlertDialog.Builder(this)
                .setTitle("Playback Error")
                .setMessage("Unable to play this video. Would you like to try opening it in another app?")
                .setPositiveButton("Open with...", (dialog, which) -> {
                    openInExternalPlayer();
                })
                .setNegativeButton("Cancel", (dialog, which) -> {
                    finish();
                })
                .setOnCancelListener(dialog -> finish())
                .show();
        } catch (Exception e) {
            logError("Failed to show dialog: " + e.getMessage());
            // Fallback: try external player directly
            openInExternalPlayer();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event != null
            && event.getKeyCode() == KeyEvent.KEYCODE_BACK
            && event.getAction() == KeyEvent.ACTION_UP) {
            exitPlayerAndApp();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        exitPlayerAndApp();
    }

    @Override
    protected void onStart() {
        super.onStart();
        // Register PiP action receiver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            registerPipActionReceiver();
        }
        if (exoPlayer != null && !isInPipMode) {
            exoPlayer.setPlayWhenReady(true);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (exoPlayer != null && !isInPipMode) {
            exoPlayer.setPlayWhenReady(true);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Don't pause playback if entering PiP mode
        if (exoPlayer != null && !isInPipMode) {
            exoPlayer.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Unregister PiP action receiver
        if (pipActionReceiver != null) {
            try {
                unregisterReceiver(pipActionReceiver);
            } catch (Exception ignored) {}
            pipActionReceiver = null;
        }
        if (exoPlayer != null && !isInPipMode) {
            exoPlayer.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        releasePlayer();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Auto-enter PiP when user navigates away while playing
        // On Android 12+, this is handled automatically via setAutoEnterEnabled(true) if PiP is enabled
        // On Android 8-11, we need to manually enter PiP mode
        if (isPipEnabled
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O 
            && Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            && exoPlayer != null 
            && exoPlayer.isPlaying()) {
            enterPipMode();
        }
        // On Android 12+ with PiP enabled, PiP is entered automatically due to setupAutoEnterPip()
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        isInPipMode = isInPictureInPictureMode;
        logInfo("PiP mode: " + (isInPipMode ? "ENTERED" : "EXITED"));
        
        if (isInPipMode) {
            // Hide all UI controls in PiP mode
            if (topBar != null) topBar.setVisibility(View.GONE);
            if (playerView != null) playerView.setUseController(false);
            hideHandler.removeCallbacks(hideRunnable);
        } else {
            // Restore UI when exiting PiP
            if (playerView != null) playerView.setUseController(true);
            showTopBar();
            scheduleHide();
            
            // If user closed PiP without returning to app, finish the activity
            if (exoPlayer != null && !exoPlayer.isPlaying()) {
                // User likely closed PiP - check if we should exit
            }
        }
    }

    /**
     * Enter Picture-in-Picture mode.
     * Requires Android 8.0 (API 26) or higher.
     */
    @RequiresApi(api = Build.VERSION_CODES.O)
    private void enterPipMode() {
        // Check if PiP is enabled in user settings
        if (!isPipEnabled) {
            logInfo("PiP mode is disabled in settings");
            return;
        }
        
        if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            Toast.makeText(this, "PiP not supported on this device", Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            // Calculate aspect ratio from video dimensions
            Rational aspectRatio = new Rational(videoWidth, videoHeight);
            
            // Clamp to allowed PiP aspect ratios (between 1:2.39 and 2.39:1)
            float ratio = (float) videoWidth / videoHeight;
            if (ratio < 0.418f) {
                aspectRatio = new Rational(1, 239);
            } else if (ratio > 2.39f) {
                aspectRatio = new Rational(239, 100);
            }

            PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder()
                .setAspectRatio(aspectRatio);
            
            // Add remote actions for Android 8.0+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ArrayList<RemoteAction> actions = buildPipRemoteActions();
                pipBuilder.setActions(actions);
            }

            // Enable seamless resize on Android 12+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                pipBuilder.setSeamlessResizeEnabled(true);
                pipBuilder.setAutoEnterEnabled(true);
            }

            logInfo("Entering PiP mode (aspect: " + videoWidth + ":" + videoHeight + ")");
            
            // CRITICAL: Set isInPipMode BEFORE calling enterPictureInPictureMode
            // because onStop() is called before onPictureInPictureModeChanged(),
            // and we need to prevent playback from being paused in onStop()
            isInPipMode = true;
            
            boolean entered = enterPictureInPictureMode(pipBuilder.build());
            if (!entered) {
                // PiP failed, reset the flag
                isInPipMode = false;
                logWarn("enterPictureInPictureMode returned false");
            }
            
        } catch (Exception e) {
            isInPipMode = false; // Reset on failure
            logError("Failed to enter PiP: " + e.getMessage());
            Toast.makeText(this, "Unable to enter PiP mode", Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Set up auto-enter PiP mode for Android 12+.
     * This configures the activity to automatically enter PiP when the user navigates away,
     * without needing to call enterPictureInPictureMode() manually.
     */
    private void setupAutoEnterPip() {
        // Check if PiP is enabled in user settings
        if (!isPipEnabled) {
            logInfo("PiP mode is disabled in settings, skipping auto-enter setup");
            return;
        }
        
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            // Auto-enter not available before Android 12
            return;
        }
        
        if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            return;
        }
        
        try {
            // Calculate aspect ratio from video dimensions
            Rational aspectRatio = new Rational(videoWidth, videoHeight);
            
            // Clamp to allowed PiP aspect ratios (between 1:2.39 and 2.39:1)
            float ratio = (float) videoWidth / videoHeight;
            if (ratio < 0.418f) {
                aspectRatio = new Rational(1, 239);
            } else if (ratio > 2.39f) {
                aspectRatio = new Rational(239, 100);
            }
            
            // Build PiP params with auto-enter enabled
            PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder()
                .setAspectRatio(aspectRatio)
                .setAutoEnterEnabled(true)
                .setSeamlessResizeEnabled(true);
            
            // Add remote actions
            ArrayList<RemoteAction> actions = buildPipRemoteActions();
            pipBuilder.setActions(actions);
            
            // Set the source rect hint for smooth transition (use playerView bounds)
            if (playerView != null) {
                android.graphics.Rect sourceRect = new android.graphics.Rect();
                playerView.getGlobalVisibleRect(sourceRect);
                if (sourceRect.width() > 0 && sourceRect.height() > 0) {
                    pipBuilder.setSourceRectHint(sourceRect);
                }
            }
            
            // Apply the PiP params to the activity
            setPictureInPictureParams(pipBuilder.build());
            logInfo("Auto-enter PiP configured (Android 12+)");
            
        } catch (Exception e) {
            logWarn("Failed to setup auto-enter PiP: " + e.getMessage());
        }
    }

    /**
     * Update PiP params when video size changes or play state changes.
     */
    @RequiresApi(api = Build.VERSION_CODES.O)
    private void updatePipParams() {
        if (!isInPipMode) return;
        
        try {
            Rational aspectRatio = new Rational(videoWidth, videoHeight);
            
            ArrayList<RemoteAction> actions = buildPipRemoteActions();

            PictureInPictureParams.Builder pipBuilder = new PictureInPictureParams.Builder()
                .setAspectRatio(aspectRatio)
                .setActions(actions);
            
            setPictureInPictureParams(pipBuilder.build());
        } catch (Exception e) {
            logWarn("Failed to update PiP params: " + e.getMessage());
        }
    }

    /**
     * Build the list of remote actions for PiP mode.
     * Includes: Seek Back (-10s), Play/Pause, Seek Forward (+10s)
     */
    @RequiresApi(api = Build.VERSION_CODES.O)
    private ArrayList<RemoteAction> buildPipRemoteActions() {
        ArrayList<RemoteAction> actions = new ArrayList<>();
        
        // 1. Seek Back (-10s)
        Intent seekBackIntent = new Intent(PIP_ACTION_SEEK_BACK);
        PendingIntent seekBackPending = PendingIntent.getBroadcast(
            this, 1, seekBackIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        RemoteAction seekBackAction = new RemoteAction(
            Icon.createWithResource(this, android.R.drawable.ic_media_rew),
            "-10s",
            "Seek back 10 seconds",
            seekBackPending
        );
        actions.add(seekBackAction);
        
        // 2. Play/Pause
        boolean isPlaying = exoPlayer != null && exoPlayer.isPlaying();
        int iconRes = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String title = isPlaying ? "Pause" : "Play";
        
        Intent playPauseIntent = new Intent(PIP_ACTION_PLAY_PAUSE);
        PendingIntent playPausePending = PendingIntent.getBroadcast(
            this, 2, playPauseIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        RemoteAction playPauseAction = new RemoteAction(
            Icon.createWithResource(this, iconRes),
            title,
            title,
            playPausePending
        );
        actions.add(playPauseAction);
        
        // 3. Seek Forward (+10s)
        Intent seekForwardIntent = new Intent(PIP_ACTION_SEEK_FORWARD);
        PendingIntent seekForwardPending = PendingIntent.getBroadcast(
            this, 3, seekForwardIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        RemoteAction seekForwardAction = new RemoteAction(
            Icon.createWithResource(this, android.R.drawable.ic_media_ff),
            "+10s",
            "Seek forward 10 seconds",
            seekForwardPending
        );
        actions.add(seekForwardAction);
        
        return actions;
    }

    /**
     * Register broadcast receiver for PiP remote actions (play/pause, seek).
     */
    @RequiresApi(api = Build.VERSION_CODES.O)
    private void registerPipActionReceiver() {
        if (pipActionReceiver != null) return;
        
        pipActionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (exoPlayer == null) return;
                
                String action = intent.getAction();
                if (PIP_ACTION_PLAY_PAUSE.equals(action)) {
                    if (exoPlayer.isPlaying()) {
                        exoPlayer.pause();
                    } else {
                        exoPlayer.play();
                    }
                } else if (PIP_ACTION_SEEK_BACK.equals(action)) {
                    long newPosition = Math.max(0, exoPlayer.getCurrentPosition() - PIP_SEEK_INCREMENT_MS);
                    exoPlayer.seekTo(newPosition);
                    logInfo("PiP seek back to: " + (newPosition / 1000) + "s");
                } else if (PIP_ACTION_SEEK_FORWARD.equals(action)) {
                    long duration = exoPlayer.getDuration();
                    long newPosition = exoPlayer.getCurrentPosition() + PIP_SEEK_INCREMENT_MS;
                    if (duration > 0) {
                        newPosition = Math.min(duration, newPosition);
                    }
                    exoPlayer.seekTo(newPosition);
                    logInfo("PiP seek forward to: " + (newPosition / 1000) + "s");
                }
                
                // Update PiP button icons
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    updatePipParams();
                }
            }
        };
        
        IntentFilter filter = new IntentFilter();
        filter.addAction(PIP_ACTION_PLAY_PAUSE);
        filter.addAction(PIP_ACTION_SEEK_BACK);
        filter.addAction(PIP_ACTION_SEEK_FORWARD);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pipActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(pipActionReceiver, filter);
        }
    }
}
