package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.graphics.SurfaceTexture;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.MediaController;
import android.widget.Toast;

import java.io.IOException;

/**
 * NativeVideoPlayerActivity
 * Native Android video playback using TextureView + MediaPlayer.
 * (Close button overlay removed.)
 */
public class NativeVideoPlayerActivity extends Activity implements TextureView.SurfaceTextureListener, MediaController.MediaPlayerControl {
    private static final String TAG = "NativeVideoPlayer";
    private static final int AUTO_HIDE_DELAY_MS = 4000;

    private FrameLayout root;
    private TextureView textureView;

    private MediaPlayer mediaPlayer;
    private MediaController mediaController;
    private Surface surface;

    private Uri videoUri;
    private boolean isPrepared = false;
    private int videoWidth = 0;
    private int videoHeight = 0;

    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private final Runnable hideRunnable = () -> {
        if (mediaController != null) mediaController.hide();
    };

    private void exitPlayerAndApp() {
        Log.d(TAG, "Exiting player");
        releasePlayer();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask();
        } else {
            finish();
        }
    }

    private void releasePlayer() {
        hideHandler.removeCallbacks(hideRunnable);

        if (mediaController != null) {
            try {
                mediaController.hide();
            } catch (Exception ignored) {}
        }

        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
            } catch (Exception ignored) {}
            try {
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }

        if (surface != null) {
            try {
                surface.release();
            } catch (Exception ignored) {}
            surface = null;
        }

        isPrepared = false;
    }

    private void toggleMediaControls() {
        if (mediaController == null) return;

        // MediaController doesn't expose isShowing(), so we just show and re-schedule hide.
        mediaController.show(AUTO_HIDE_DELAY_MS);
        hideHandler.removeCallbacks(hideRunnable);
        hideHandler.postDelayed(hideRunnable, AUTO_HIDE_DELAY_MS);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
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

            // Video surface
            textureView = new TextureView(this);
            textureView.setSurfaceTextureListener(this);
            FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            );
            root.addView(textureView, videoParams);

            // Tap toggles media controls
            textureView.setOnClickListener(v -> toggleMediaControls());

            // Intent data
            Intent intent = getIntent();
            videoUri = intent != null ? intent.getData() : null;
            String mimeType = intent != null ? intent.getType() : null;
            Log.d(TAG, "Starting native playback. uri=" + videoUri + ", type=" + mimeType);

            if (videoUri == null) {
                Log.e(TAG, "No video URI provided");
                showErrorAndFinish("No video URI provided");
                return;
            }

            // MediaController
            mediaController = new MediaController(this);
            mediaController.setMediaPlayer(this);
            mediaController.setAnchorView(root);
        } catch (Exception e) {
            Log.e(TAG, "Error in onCreate: " + e.getMessage(), e);
            showErrorAndFinish("Failed to initialize video player");
        }
    }

    private void showErrorAndFinish(String message) {
        try {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {}
        finish();
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
    public void onSurfaceTextureAvailable(SurfaceTexture surfaceTexture, int width, int height) {
        try {
            surface = new Surface(surfaceTexture);

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setSurface(surface);
            
            // Use AudioAttributes instead of deprecated setAudioStreamType
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                    .build();
                mediaPlayer.setAudioAttributes(audioAttributes);
            } else {
                // Fallback for older devices
                mediaPlayer.setAudioStreamType(AudioManager.STREAM_MUSIC);
            }

            mediaPlayer.setOnPreparedListener(mp -> {
                try {
                    isPrepared = true;
                    videoWidth = mp.getVideoWidth();
                    videoHeight = mp.getVideoHeight();
                    adjustVideoSize();
                    mp.start();
                    toggleMediaControls();
                } catch (Exception e) {
                    Log.e(TAG, "Error in onPrepared: " + e.getMessage(), e);
                }
            });

            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error what=" + what + " extra=" + extra + " uri=" + videoUri);
                showErrorAndFinish("Unable to play video (error: " + what + ")");
                return true; // Return true to indicate we handled the error
            });
            
            mediaPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Video playback completed");
            });

            try {
                mediaPlayer.setDataSource(this, videoUri);
                mediaPlayer.prepareAsync();
            } catch (IOException e) {
                Log.e(TAG, "Failed to set data source: " + e.getMessage(), e);
                showErrorAndFinish("Cannot access video file");
            } catch (IllegalArgumentException e) {
                Log.e(TAG, "Invalid video URI: " + e.getMessage(), e);
                showErrorAndFinish("Invalid video file");
            } catch (SecurityException e) {
                Log.e(TAG, "Permission denied for video: " + e.getMessage(), e);
                showErrorAndFinish("Permission denied to access video");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error setting up media player: " + e.getMessage(), e);
            showErrorAndFinish("Failed to initialize video playback");
        }
    }

    private void adjustVideoSize() {
        if (videoWidth == 0 || videoHeight == 0) return;

        int screenWidth = root.getWidth();
        int screenHeight = root.getHeight();
        if (screenWidth == 0 || screenHeight == 0) return;

        float videoAspect = (float) videoWidth / videoHeight;
        float screenAspect = (float) screenWidth / screenHeight;

        int newWidth;
        int newHeight;

        if (videoAspect > screenAspect) {
            newWidth = screenWidth;
            newHeight = (int) (screenWidth / videoAspect);
        } else {
            newHeight = screenHeight;
            newWidth = (int) (screenHeight * videoAspect);
        }

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(newWidth, newHeight, Gravity.CENTER);
        textureView.setLayoutParams(params);
    }

    @Override
    public void onSurfaceTextureSizeChanged(SurfaceTexture surfaceTexture, int width, int height) {
        adjustVideoSize();
    }

    @Override
    public boolean onSurfaceTextureDestroyed(SurfaceTexture surfaceTexture) {
        releasePlayer();
        return true;
    }

    @Override
    public void onSurfaceTextureUpdated(SurfaceTexture surfaceTexture) {
        // no-op
    }

    // MediaController.MediaPlayerControl
    @Override
    public void start() {
        if (mediaPlayer != null && isPrepared) {
            try {
                mediaPlayer.start();
            } catch (Exception e) {
                Log.e(TAG, "Error starting playback: " + e.getMessage());
            }
        }
    }

    @Override
    public void pause() {
        if (mediaPlayer != null && isPrepared) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.pause();
            } catch (Exception e) {
                Log.e(TAG, "Error pausing playback: " + e.getMessage());
            }
        }
    }

    @Override
    public int getDuration() {
        try {
            return (mediaPlayer != null && isPrepared) ? mediaPlayer.getDuration() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    @Override
    public int getCurrentPosition() {
        try {
            return (mediaPlayer != null && isPrepared) ? mediaPlayer.getCurrentPosition() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    @Override
    public void seekTo(int pos) {
        if (mediaPlayer != null && isPrepared) {
            try {
                mediaPlayer.seekTo(pos);
            } catch (Exception e) {
                Log.e(TAG, "Error seeking: " + e.getMessage());
            }
        }
    }

    @Override
    public boolean isPlaying() {
        try {
            return mediaPlayer != null && isPrepared && mediaPlayer.isPlaying();
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public int getBufferPercentage() {
        return 0;
    }

    @Override
    public boolean canPause() {
        return true;
    }

    @Override
    public boolean canSeekBackward() {
        return true;
    }

    @Override
    public boolean canSeekForward() {
        return true;
    }

    @Override
    public int getAudioSessionId() {
        try {
            return mediaPlayer != null ? mediaPlayer.getAudioSessionId() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.pause();
            } catch (Exception e) {
                Log.e(TAG, "Error pausing in onPause: " + e.getMessage());
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        releasePlayer();
    }
}
