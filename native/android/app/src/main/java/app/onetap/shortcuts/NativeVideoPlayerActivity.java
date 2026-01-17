package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.widget.MediaController;
import android.widget.VideoView;

/**
 * NativeVideoPlayerActivity
 * Uses Android's native VideoView so playback doesn't depend on WebView codecs/network stack.
 */
public class NativeVideoPlayerActivity extends Activity {
    private static final String TAG = "NativeVideoPlayer";

    private void exitPlayerAndApp() {
        Log.d(TAG, "Exiting player (back pressed)");
        // When started from a shortcut we want to close the whole task, not return to the WebView.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask();
        } else {
            finish();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // MediaController can consume BACK; intercept it at Activity level so it always exits.
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        VideoView videoView = new VideoView(this);
        setContentView(videoView);

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

        videoView.setOnErrorListener(new MediaPlayer.OnErrorListener() {
            @Override
            public boolean onError(MediaPlayer mp, int what, int extra) {
                Log.e(TAG, "VideoView error what=" + what + " extra=" + extra + " uri=" + uri);
                // return false to allow system default error handling
                return false;
            }
        });

        videoView.setOnPreparedListener(mp -> {
            Log.d(TAG, "Video prepared, starting playback");
            videoView.start();
        });

        try {
            videoView.setVideoURI(uri);
            videoView.requestFocus();
        } catch (Exception e) {
            Log.e(TAG, "Failed to setVideoURI: " + e.getMessage());
            finish();
        }
    }
}
