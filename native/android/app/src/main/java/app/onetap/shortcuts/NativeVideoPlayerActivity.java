package app.onetap.shortcuts;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Log;
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
import androidx.media3.common.C;
import androidx.media3.common.ColorInfo;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.video.VideoFrameMetadataListener;
import androidx.media3.ui.PlayerView;

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

    private FrameLayout root;
    private PlayerView playerView;
    private LinearLayout topBar;
    private LinearLayout debugOverlay;
    private TextView debugTextView;
    private boolean isDebugVisible = false;

    private ExoPlayer exoPlayer;

    private Uri videoUri;
    private String videoMimeType;
    private boolean hasTriedExternalFallback = false;
    private boolean isTopBarVisible = true;

    // HDR state
    private boolean isHdrContent = false;
    private boolean isHdrDisplaySupported = false;
    private String hdrType = "SDR";
    private String colorSpace = "unknown";
    private String colorTransfer = "unknown";

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startTimeMs = System.currentTimeMillis();

        try {
            logInfo("onCreate started (ExoPlayer)");
            
            // Fullscreen
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                );
            }

            // Root
            root = new FrameLayout(this);
            root.setBackgroundColor(0xFF000000);
            setContentView(root);

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

            // Intent data
            Intent intent = getIntent();
            videoUri = intent != null ? intent.getData() : null;
            videoMimeType = intent != null ? intent.getType() : "video/*";
            if (videoMimeType == null || videoMimeType.isEmpty()) {
                videoMimeType = "video/*";
            }
            
            logInfo("URI: " + (videoUri != null ? videoUri.toString() : "null"));
            logInfo("MIME type: " + videoMimeType);
            logInfo("Scheme: " + (videoUri != null ? videoUri.getScheme() : "null"));
            
            // Log additional URI details
            if (videoUri != null) {
                logUriDetails(videoUri);
            }

            if (videoUri == null) {
                logError("No video URI provided");
                showErrorAndFinish("No video URI provided");
                return;
            }

            // Check permissions for content URI
            checkUriPermissions(videoUri);

            // Create top bar with buttons
            createTopBar();
            
            // Create debug overlay
            createDebugOverlay();

            // Initialize ExoPlayer
            initializePlayer();
            
            // Schedule initial hide
            scheduleHide();
        } catch (Exception e) {
            logError("onCreate error: " + e.getMessage());
            showErrorAndFinish("Failed to initialize video player");
        }
    }

    private void initializePlayer() {
        logInfo("Initializing ExoPlayer with HDR support...");
        
        // Check HDR display capability
        checkHdrDisplaySupport();
        
        try {
            // Use DefaultRenderersFactory with extension decoder mode for broader HDR codec support
            DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(this)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
                .setEnableDecoderFallback(true);
            
            exoPlayer = new ExoPlayer.Builder(this, renderersFactory)
                .setVideoScalingMode(C.VIDEO_SCALING_MODE_SCALE_TO_FIT)
                .build();
            
            playerView.setPlayer(exoPlayer);
            
            logInfo("ExoPlayer created with HDR-capable renderers");
            
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
                }

                @Override
                public void onVideoSizeChanged(VideoSize videoSize) {
                    logInfo("Video size: " + videoSize.width + "x" + videoSize.height);
                }
            });

            // Create media item and start playback
            MediaItem mediaItem = MediaItem.fromUri(videoUri);
            exoPlayer.setMediaItem(mediaItem);
            
            logInfo("Media item set, preparing...");
            exoPlayer.prepare();
            exoPlayer.setPlayWhenReady(true);
            
            logInfo("Playback started");
            
        } catch (Exception e) {
            logError("Failed to initialize ExoPlayer: " + e.getMessage());
            showExternalPlayerDialog("Failed to initialize video player");
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
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {}
        finish();
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
        if (exoPlayer != null) {
            exoPlayer.setPlayWhenReady(true);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (exoPlayer != null) {
            exoPlayer.setPlayWhenReady(true);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (exoPlayer != null) {
            exoPlayer.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (exoPlayer != null) {
            exoPlayer.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        releasePlayer();
    }
}
