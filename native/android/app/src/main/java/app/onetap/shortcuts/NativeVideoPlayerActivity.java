package app.onetap.shortcuts;

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
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Log;
import android.util.Rational;
import android.util.TypedValue;
import android.view.Display;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
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
 * Native Android video playback using ExoPlayer (Media3) for broad codec support.
 * Includes hardware-accelerated HDR playback (HDR10, HDR10+, HLG, Dolby Vision).
 * Falls back to external player apps if internal playback fails.
 * Includes debug overlay for diagnosing device-specific failures.
 */
@OptIn(markerClass = UnstableApi.class)
public class NativeVideoPlayerActivity extends Activity {
    private static final String TAG = "NativeVideoPlayer";
    private static final int AUTO_HIDE_DELAY_MS = 4000;
    private static final float[] PLAYBACK_SPEEDS = {0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f};

    private FrameLayout root;
    private PlayerView playerView;
    private LinearLayout topBar;
    private LinearLayout debugOverlay;
    private LinearLayout intentDiagnosticsOverlay;
    private TextView debugTextView;
    private TextView intentDiagnosticsTextView;
    private TextView speedButton;
    private boolean isDebugVisible = false;
    private boolean isIntentDiagnosticsVisible = false;

    private ExoPlayer exoPlayer;

    private Uri videoUri;
    private String videoMimeType;
    private boolean hasTriedExternalFallback = false;
    private boolean isTopBarVisible = true;
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
    private int videoWidth = 16;
    private int videoHeight = 9;
    private static final String PIP_ACTION_PLAY_PAUSE = "app.onetap.shortcuts.PIP_PLAY_PAUSE";
    private static final String PIP_ACTION_SEEK_BACK = "app.onetap.shortcuts.PIP_SEEK_BACK";
    private static final String PIP_ACTION_SEEK_FORWARD = "app.onetap.shortcuts.PIP_SEEK_FORWARD";
    private static final long PIP_SEEK_INCREMENT_MS = 10000; // 10 seconds
    private BroadcastReceiver pipActionReceiver;

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

        if (exoPlayer != null) {
            try {
                exoPlayer.stop();
                exoPlayer.release();
            } catch (Exception ignored) {}
            exoPlayer = null;
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

    private void toggleDebugOverlay() {
        if (debugOverlay == null) return;
        
        isDebugVisible = !isDebugVisible;
        debugOverlay.setVisibility(isDebugVisible ? View.VISIBLE : View.GONE);
        
        if (isDebugVisible) {
            updateDebugOverlay();
            // Keep controls visible while debug is shown
            hideHandler.removeCallbacks(hideRunnable);
        }
    }

    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, dp, getResources().getDisplayMetrics()
        );
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
            logInfo("onCreate started (ExoPlayer)");
            
            // Fullscreen
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            // Root
            root = new FrameLayout(this);
            root.setBackgroundColor(0xFF000000);
            setContentView(root);

            // Apply immersive mode after decor view exists.
            applyImmersiveModeSafely();

            // ExoPlayer view
            playerView = new PlayerView(this);
            playerView.setBackgroundColor(Color.BLACK);
            playerView.setUseController(true);
            playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
            playerView.setControllerAutoShow(true);
            playerView.setControllerShowTimeoutMs(AUTO_HIDE_DELAY_MS);
            
            FrameLayout.LayoutParams playerParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
            root.addView(playerView, playerParams);

            // Tap to toggle top bar (PlayerView handles its own controls)
            playerView.setOnClickListener(v -> toggleTopBar());

            // Store intent for diagnostics
            launchIntent = getIntent();
            
            // Intent data
            videoUri = launchIntent != null ? launchIntent.getData() : null;
            videoMimeType = launchIntent != null ? launchIntent.getType() : "video/*";
            if (videoMimeType == null || videoMimeType.isEmpty()) {
                videoMimeType = "video/*";
            }
            
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
                // Show diagnostics screen instead of just finishing
                showIntentDiagnosticsOnError();
                return;
            }

            // Check permissions for content URI
            checkUriPermissions(videoUri);

            // Create top bar with buttons
            createTopBar();
            
            // Create debug overlay
            createDebugOverlay();
            
            // Create intent diagnostics overlay
            createIntentDiagnosticsOverlay();

            // Initialize ExoPlayer
            initializePlayer();
            
            // Schedule initial hide
            scheduleHide();
        } catch (Throwable t) {
            handleFatalInitError("onCreate failed", t);
        }
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
                        showTopBar();
                        scheduleHide();
                        // Check video format for HDR info
                        detectHdrFromCurrentTrack();
                    } else if (playbackState == Player.STATE_ENDED) {
                        logInfo("Playback completed");
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
        // Top bar container with gradient background
        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        topBar.setPadding(dpToPx(16), dpToPx(16), dpToPx(16), dpToPx(16));
        
        // Gradient background (top to transparent)
        GradientDrawable gradient = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0x80000000, 0x00000000}
        );
        topBar.setBackground(gradient);

        FrameLayout.LayoutParams topBarParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpToPx(72),
            Gravity.TOP
        );
        root.addView(topBar, topBarParams);

        // Speed button (text button showing current speed)
        speedButton = createSpeedButton();
        speedButton.setOnClickListener(v -> cyclePlaybackSpeed());
        
        LinearLayout.LayoutParams speedParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, dpToPx(40)
        );
        speedParams.setMargins(dpToPx(8), 0, dpToPx(8), 0);
        topBar.addView(speedButton, speedParams);

        // Intent diagnostics button (document icon)
        ImageButton intentButton = createIconButton(
            android.R.drawable.ic_menu_agenda,
            "Show intent diagnostics"
        );
        intentButton.setOnClickListener(v -> toggleIntentDiagnostics());
        
        LinearLayout.LayoutParams intentParams = new LinearLayout.LayoutParams(
            dpToPx(48), dpToPx(48)
        );
        intentParams.setMargins(dpToPx(8), 0, dpToPx(8), 0);
        topBar.addView(intentButton, intentParams);

        // Debug button (info icon)
        ImageButton debugButton = createIconButton(
            android.R.drawable.ic_menu_info_details,
            "Show debug info"
        );
        debugButton.setOnClickListener(v -> toggleDebugOverlay());
        
        LinearLayout.LayoutParams debugParams = new LinearLayout.LayoutParams(
            dpToPx(48), dpToPx(48)
        );
        debugParams.setMargins(dpToPx(8), 0, dpToPx(8), 0);
        topBar.addView(debugButton, debugParams);

        // PiP button (Picture-in-Picture) - only on Android 8.0+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ImageButton pipButton = createIconButton(
                android.R.drawable.ic_menu_crop,
                "Picture-in-Picture"
            );
            pipButton.setOnClickListener(v -> enterPipMode());
            
            LinearLayout.LayoutParams pipParams = new LinearLayout.LayoutParams(
                dpToPx(48), dpToPx(48)
            );
            pipParams.setMargins(dpToPx(8), 0, dpToPx(8), 0);
            topBar.addView(pipButton, pipParams);
        }

        // "Open with" button
        ImageButton openWithButton = createIconButton(
            android.R.drawable.ic_menu_share,
            "Open with another app"
        );
        openWithButton.setOnClickListener(v -> openInExternalPlayerDirect());
        
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
            dpToPx(48), dpToPx(48)
        );
        buttonParams.setMargins(dpToPx(8), 0, dpToPx(8), 0);
        topBar.addView(openWithButton, buttonParams);
    }

    private TextView createSpeedButton() {
        TextView button = new TextView(this);
        button.setText(getSpeedLabel(PLAYBACK_SPEEDS[currentSpeedIndex]));
        button.setTextColor(Color.WHITE);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dpToPx(16), dpToPx(8), dpToPx(16), dpToPx(8));
        button.setContentDescription("Playback speed");
        
        // Pill-shaped background
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dpToPx(20));
        bg.setColor(0x40FFFFFF);
        button.setBackground(bg);
        
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

    private void createDebugOverlay() {
        // Semi-transparent overlay
        debugOverlay = new LinearLayout(this);
        debugOverlay.setOrientation(LinearLayout.VERTICAL);
        debugOverlay.setBackgroundColor(0xDD000000);
        debugOverlay.setPadding(dpToPx(16), dpToPx(80), dpToPx(16), dpToPx(16));
        debugOverlay.setVisibility(View.GONE);
        
        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(debugOverlay, overlayParams);
        
        // Title
        TextView titleView = new TextView(this);
        titleView.setText("Debug Info (tap ⓘ to close)");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        titleView.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        titleView.setPadding(0, 0, 0, dpToPx(8));
        debugOverlay.addView(titleView);
        
        // Scrollable debug text
        ScrollView scrollView = new ScrollView(this);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1.0f
        );
        debugOverlay.addView(scrollView, scrollParams);
        
        debugTextView = new TextView(this);
        debugTextView.setTextColor(0xFF00FF00); // Green terminal color
        debugTextView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        debugTextView.setTypeface(Typeface.MONOSPACE);
        debugTextView.setLineSpacing(0, 1.2f);
        scrollView.addView(debugTextView);
        
        // Copy button
        TextView copyButton = new TextView(this);
        copyButton.setText("📋 Copy to Clipboard");
        copyButton.setTextColor(Color.WHITE);
        copyButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        copyButton.setPadding(dpToPx(16), dpToPx(12), dpToPx(16), dpToPx(12));
        copyButton.setGravity(Gravity.CENTER);
        
        GradientDrawable copyBg = new GradientDrawable();
        copyBg.setCornerRadius(dpToPx(8));
        copyBg.setColor(0xFF333333);
        copyButton.setBackground(copyBg);
        
        LinearLayout.LayoutParams copyParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        copyParams.topMargin = dpToPx(12);
        debugOverlay.addView(copyButton, copyParams);
        
        copyButton.setOnClickListener(v -> copyDebugToClipboard());
        
        // Tap overlay to close
        debugOverlay.setOnClickListener(v -> toggleDebugOverlay());
    }

    private void copyDebugToClipboard() {
        try {
            android.content.ClipboardManager clipboard = 
                (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (clipboard != null && debugTextView != null) {
                ClipData clip = ClipData.newPlainText("Video Debug Info", debugTextView.getText());
                clipboard.setPrimaryClip(clip);
                Toast.makeText(this, "Debug info copied!", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            logWarn("Failed to copy to clipboard: " + e.getMessage());
        }
    }

    /**
     * Create the Intent diagnostics overlay.
     */
    private void createIntentDiagnosticsOverlay() {
        intentDiagnosticsOverlay = new LinearLayout(this);
        intentDiagnosticsOverlay.setOrientation(LinearLayout.VERTICAL);
        intentDiagnosticsOverlay.setBackgroundColor(0xEE1A1A2E);
        intentDiagnosticsOverlay.setPadding(dpToPx(16), dpToPx(80), dpToPx(16), dpToPx(16));
        intentDiagnosticsOverlay.setVisibility(View.GONE);
        
        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(intentDiagnosticsOverlay, overlayParams);
        
        // Title
        TextView titleView = new TextView(this);
        titleView.setText("📋 INTENT DIAGNOSTICS");
        titleView.setTextColor(0xFFFFD700);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        titleView.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        titleView.setPadding(0, 0, 0, dpToPx(12));
        intentDiagnosticsOverlay.addView(titleView);
        
        // Scrollable content
        ScrollView scrollView = new ScrollView(this);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1.0f
        );
        intentDiagnosticsOverlay.addView(scrollView, scrollParams);
        
        intentDiagnosticsTextView = new TextView(this);
        intentDiagnosticsTextView.setTextColor(0xFF00FFFF);
        intentDiagnosticsTextView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        intentDiagnosticsTextView.setTypeface(Typeface.MONOSPACE);
        intentDiagnosticsTextView.setLineSpacing(0, 1.3f);
        scrollView.addView(intentDiagnosticsTextView);
        
        // Update content
        updateIntentDiagnosticsContent();
        
        // Button row
        LinearLayout buttonRow = new LinearLayout(this);
        buttonRow.setOrientation(LinearLayout.HORIZONTAL);
        buttonRow.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams buttonRowParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        buttonRowParams.topMargin = dpToPx(12);
        intentDiagnosticsOverlay.addView(buttonRow, buttonRowParams);
        
        // Copy button
        TextView copyButton = createTextButton("📋 Copy", 0xFF4CAF50);
        copyButton.setOnClickListener(v -> {
            copyToClipboard("Intent Diagnostics", intentDiagnosticsTextView.getText().toString());
            Toast.makeText(this, "Copied!", Toast.LENGTH_SHORT).show();
        });
        buttonRow.addView(copyButton);
        
        // Close button
        TextView closeButton = createTextButton("✕ Close", 0xFF666666);
        closeButton.setOnClickListener(v -> toggleIntentDiagnostics());
        buttonRow.addView(closeButton);
        
        // Open with button
        TextView openWithButton = createTextButton("🎬 Open with...", 0xFF2196F3);
        openWithButton.setOnClickListener(v -> openInExternalPlayer());
        buttonRow.addView(openWithButton);
    }

    private TextView createTextButton(String text, int bgColor) {
        TextView button = new TextView(this);
        button.setText(text);
        button.setTextColor(Color.WHITE);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dpToPx(14), dpToPx(10), dpToPx(14), dpToPx(10));
        
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dpToPx(6));
        bg.setColor(bgColor);
        button.setBackground(bg);
        
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f
        );
        params.setMargins(dpToPx(4), 0, dpToPx(4), 0);
        button.setLayoutParams(params);
        
        return button;
    }

    private void updateIntentDiagnosticsContent() {
        if (intentDiagnosticsTextView == null) return;
        
        StringBuilder sb = new StringBuilder();
        sb.append(buildIntentDiagnosticsString(launchIntent));
        intentDiagnosticsTextView.setText(sb.toString());
    }

    private String buildIntentDiagnosticsString(Intent intent) {
        StringBuilder sb = new StringBuilder();
        
        sb.append("═══════════════════════════════════\n");
        sb.append("         LAUNCH INTENT DETAILS\n");
        sb.append("═══════════════════════════════════\n\n");
        
        if (intent == null) {
            sb.append("⚠️ Intent is NULL!\n\n");
            sb.append("This means the Activity was launched\n");
            sb.append("without any Intent data.\n\n");
            sb.append("Possible causes:\n");
            sb.append("• Shortcut was created incorrectly\n");
            sb.append("• Intent extras were not set\n");
            sb.append("• Activity was recreated after crash\n");
            return sb.toString();
        }
        
        // Action
        sb.append("🎯 ACTION:\n");
        String action = intent.getAction();
        sb.append("   ").append(action != null ? action : "(null)").append("\n\n");
        
        // Data URI
        sb.append("📁 DATA URI:\n");
        Uri data = intent.getData();
        if (data != null) {
            sb.append("   ").append(data.toString()).append("\n");
            sb.append("   Scheme: ").append(data.getScheme()).append("\n");
            sb.append("   Host: ").append(data.getHost() != null ? data.getHost() : "(none)").append("\n");
            sb.append("   Path: ").append(data.getPath() != null ? data.getPath() : "(none)").append("\n");
        } else {
            sb.append("   ⚠️ (null) - NO DATA URI!\n");
        }
        sb.append("\n");
        
        // MIME Type
        sb.append("📝 MIME TYPE:\n");
        String type = intent.getType();
        sb.append("   ").append(type != null ? type : "(null)").append("\n\n");
        
        // Flags
        sb.append("🚩 FLAGS:\n");
        int flags = intent.getFlags();
        sb.append("   Raw: 0x").append(Integer.toHexString(flags)).append("\n");
        if ((flags & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0) {
            sb.append("   ✓ FLAG_GRANT_READ_URI_PERMISSION\n");
        }
        if ((flags & Intent.FLAG_ACTIVITY_NEW_TASK) != 0) {
            sb.append("   ✓ FLAG_ACTIVITY_NEW_TASK\n");
        }
        if ((flags & Intent.FLAG_ACTIVITY_CLEAR_TOP) != 0) {
            sb.append("   ✓ FLAG_ACTIVITY_CLEAR_TOP\n");
        }
        sb.append("\n");
        
        // ClipData
        sb.append("📎 CLIP DATA:\n");
        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            sb.append("   Items: ").append(clipData.getItemCount()).append("\n");
            for (int i = 0; i < clipData.getItemCount(); i++) {
                ClipData.Item item = clipData.getItemAt(i);
                if (item.getUri() != null) {
                    sb.append("   [").append(i).append("] URI: ").append(item.getUri()).append("\n");
                }
                if (item.getText() != null) {
                    sb.append("   [").append(i).append("] Text: ").append(item.getText()).append("\n");
                }
            }
        } else {
            sb.append("   (none)\n");
        }
        sb.append("\n");
        
        // Extras
        sb.append("📦 EXTRAS:\n");
        Bundle extras = intent.getExtras();
        if (extras != null && !extras.isEmpty()) {
            for (String key : extras.keySet()) {
                Object value = extras.get(key);
                String valueStr = value != null ? value.toString() : "(null)";
                // Truncate long values
                if (valueStr.length() > 60) {
                    valueStr = valueStr.substring(0, 57) + "...";
                }
                sb.append("   ").append(key).append(":\n");
                sb.append("      ").append(valueStr).append("\n");
            }
        } else {
            sb.append("   (none)\n");
        }
        sb.append("\n");
        
        // Component
        sb.append("🧩 COMPONENT:\n");
        if (intent.getComponent() != null) {
            sb.append("   ").append(intent.getComponent().getClassName()).append("\n");
        } else {
            sb.append("   (implicit intent)\n");
        }
        sb.append("\n");
        
        // Categories
        sb.append("📂 CATEGORIES:\n");
        java.util.Set<String> categories = intent.getCategories();
        if (categories != null && !categories.isEmpty()) {
            for (String cat : categories) {
                sb.append("   • ").append(cat).append("\n");
            }
        } else {
            sb.append("   (none)\n");
        }
        sb.append("\n");
        
        sb.append("═══════════════════════════════════\n");
        sb.append("           END OF DIAGNOSTICS\n");
        sb.append("═══════════════════════════════════\n");
        
        return sb.toString();
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
        
        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            logInfo("ClipData items: " + clipData.getItemCount());
        }
        
        Bundle extras = intent.getExtras();
        if (extras != null) {
            logInfo("Extras keys: " + extras.keySet().toString());
        }
    }

    private void toggleIntentDiagnostics() {
        if (intentDiagnosticsOverlay == null) return;
        
        isIntentDiagnosticsVisible = !isIntentDiagnosticsVisible;
        intentDiagnosticsOverlay.setVisibility(isIntentDiagnosticsVisible ? View.VISIBLE : View.GONE);
        
        if (isIntentDiagnosticsVisible) {
            updateIntentDiagnosticsContent();
            hideHandler.removeCallbacks(hideRunnable);
        }
    }

    /**
     * Show diagnostics screen when there's no URI (for debugging shortcut issues).
     */
    private void showIntentDiagnosticsOnError() {
        // Create minimal UI to show diagnostics
        try {
            // Ensure we have a root view
            if (root == null) {
                root = new FrameLayout(this);
                root.setBackgroundColor(0xFF000000);
                setContentView(root);
            }
            
            // Create and show the diagnostics overlay directly
            createIntentDiagnosticsOverlay();
            isIntentDiagnosticsVisible = true;
            intentDiagnosticsOverlay.setVisibility(View.VISIBLE);
            
            // Add a prominent error message at the top
            if (intentDiagnosticsTextView != null) {
                String errorHeader = "❌ ERROR: NO VIDEO URI PROVIDED\n\n" +
                    "The shortcut did not pass a valid video URI.\n" +
                    "See details below to diagnose the issue.\n\n" +
                    "─────────────────────────────────\n\n";
                intentDiagnosticsTextView.setText(errorHeader + buildIntentDiagnosticsString(launchIntent));
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to show diagnostics", e);
            showErrorAndFinish("No video URI provided");
        }
    }

    private ImageButton createIconButton(int iconResId, String contentDescription) {
        ImageButton button = new ImageButton(this);
        button.setImageResource(iconResId);
        button.setContentDescription(contentDescription);
        button.setColorFilter(Color.WHITE);
        
        // Circular background
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0x40FFFFFF);
        button.setBackground(bg);
        button.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        button.setPadding(dpToPx(12), dpToPx(12), dpToPx(12), dpToPx(12));
        
        return button;
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
        // Auto-enter PiP when user presses home button while playing
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && exoPlayer != null && exoPlayer.isPlaying()) {
            enterPipMode();
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        isInPipMode = isInPictureInPictureMode;
        logInfo("PiP mode: " + (isInPipMode ? "ENTERED" : "EXITED"));
        
        if (isInPipMode) {
            // Hide all UI controls in PiP mode
            if (topBar != null) topBar.setVisibility(View.GONE);
            if (debugOverlay != null) debugOverlay.setVisibility(View.GONE);
            if (intentDiagnosticsOverlay != null) intentDiagnosticsOverlay.setVisibility(View.GONE);
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
            enterPictureInPictureMode(pipBuilder.build());
            
        } catch (Exception e) {
            logError("Failed to enter PiP: " + e.getMessage());
            Toast.makeText(this, "Unable to enter PiP mode", Toast.LENGTH_SHORT).show();
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
