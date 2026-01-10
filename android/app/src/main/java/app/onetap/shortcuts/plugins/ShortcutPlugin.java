/*
 * UNCOMMENT THIS ENTIRE FILE AFTER GIT PULL
 * 
 * To uncomment: Remove the block comment markers at the start and end of this file
 * (the /* at line 1 and the */ /* at the end)
 */

/*
package app.onetap.shortcuts.plugins;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShortcutPlugin")
public class ShortcutPlugin extends Plugin {

    @PluginMethod
    public void createPinnedShortcut(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "createPinnedShortcut called");
        
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            android.util.Log.e("ShortcutPlugin", "Android version too old, need Oreo+");
            JSObject result = new JSObject();
            result.put("success", false);
            call.resolve(result);
            return;
        }

        Context context = getContext();
        if (context == null) {
            android.util.Log.e("ShortcutPlugin", "Context is null");
            JSObject result = new JSObject();
            result.put("success", false);
            call.resolve(result);
            return;
        }

        ShortcutManager shortcutManager = context.getSystemService(ShortcutManager.class);

        if (!shortcutManager.isRequestPinShortcutSupported()) {
            android.util.Log.e("ShortcutPlugin", "Launcher does not support pinned shortcuts");
            JSObject result = new JSObject();
            result.put("success", false);
            call.resolve(result);
            return;
        }

        String id = call.getString("id");
        String label = call.getString("label");
        String intentAction = call.getString("intentAction", "android.intent.action.VIEW");
        String intentData = call.getString("intentData");
        String intentType = call.getString("intentType");

        android.util.Log.d("ShortcutPlugin", "Creating shortcut: id=" + id + ", label=" + label + ", intentData=" + intentData);

        if (id == null || label == null || intentData == null) {
            android.util.Log.e("ShortcutPlugin", "Missing required parameters");
            call.reject("Missing required parameters");
            return;
        }

        Intent intent = new Intent(intentAction);
        Uri dataUri = Uri.parse(intentData);
        
        // CRITICAL: Use setDataAndType() when both are present
        // Calling setData() and setType() separately clears the other!
        if (intentType != null && !intentType.isEmpty()) {
            intent.setDataAndType(dataUri, intentType);
            android.util.Log.d("ShortcutPlugin", "Set data AND type: " + intentData + " / " + intentType);
        } else {
            intent.setData(dataUri);
            android.util.Log.d("ShortcutPlugin", "Set data only: " + intentData);
        }
        
        // Add flags for proper file access and new task
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        Icon icon = createIcon(call);

        ShortcutInfo shortcutInfo = new ShortcutInfo.Builder(context, id)
                .setShortLabel(label)
                .setLongLabel(label)
                .setIcon(icon)
                .setIntent(intent)
                .build();

        boolean requested = shortcutManager.requestPinShortcut(shortcutInfo, null);
        android.util.Log.d("ShortcutPlugin", "requestPinShortcut returned: " + requested);

        JSObject result = new JSObject();
        result.put("success", requested);
        call.resolve(result);
    }

    private Icon createIcon(PluginCall call) {
        String emoji = call.getString("iconEmoji");
        if (emoji != null) {
            android.util.Log.d("ShortcutPlugin", "Creating emoji icon: " + emoji);
            return createEmojiIcon(emoji);
        }

        String text = call.getString("iconText");
        if (text != null) {
            android.util.Log.d("ShortcutPlugin", "Creating text icon: " + text);
            return createTextIcon(text);
        }

        android.util.Log.d("ShortcutPlugin", "Using default icon");
        return Icon.createWithResource(getContext(), android.R.drawable.ic_menu_add);
    }

    private Icon createEmojiIcon(String emoji) {
        int size = 192;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        Paint bgPaint = new Paint();
        bgPaint.setColor(Color.parseColor("#2563EB"));
        bgPaint.setStyle(Paint.Style.FILL);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint);

        Paint textPaint = new Paint();
        textPaint.setTextSize(size * 0.5f);
        textPaint.setTextAlign(Paint.Align.CENTER);
        float y = (size / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2);
        canvas.drawText(emoji, size / 2f, y, textPaint);

        return Icon.createWithBitmap(bitmap);
    }

    private Icon createTextIcon(String text) {
        int size = 192;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        Paint bgPaint = new Paint();
        bgPaint.setColor(Color.parseColor("#2563EB"));
        bgPaint.setStyle(Paint.Style.FILL);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint);

        Paint textPaint = new Paint();
        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(size * 0.4f);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setFakeBoldText(true);
        String displayText = text.substring(0, Math.min(2, text.length())).toUpperCase();
        float y = (size / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2);
        canvas.drawText(displayText, size / 2f, y, textPaint);

        return Icon.createWithBitmap(bitmap);
    }

    @PluginMethod
    public void checkShortcutSupport(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "checkShortcutSupport called");
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ShortcutManager shortcutManager = getContext().getSystemService(ShortcutManager.class);
            boolean canPin = shortcutManager != null && shortcutManager.isRequestPinShortcutSupported();
            result.put("supported", true);
            result.put("canPin", canPin);
            android.util.Log.d("ShortcutPlugin", "Shortcut support: supported=true, canPin=" + canPin);
        } else {
            result.put("supported", false);
            result.put("canPin", false);
            android.util.Log.d("ShortcutPlugin", "Shortcut support: Android version too old");
        }

        call.resolve(result);
    }

    @PluginMethod
    public void getSharedContent(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "getSharedContent called");
        
        if (getActivity() == null) {
            android.util.Log.e("ShortcutPlugin", "Activity is null");
            call.resolve(null);
            return;
        }

        Intent intent = getActivity().getIntent();
        String action = intent.getAction();
        String type = intent.getType();

        android.util.Log.d("ShortcutPlugin", "Intent action=" + action + ", type=" + type);

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            JSObject result = new JSObject();
            result.put("action", action);
            result.put("type", type);

            if (type.startsWith("text/")) {
                String text = intent.getStringExtra(Intent.EXTRA_TEXT);
                if (text != null) {
                    result.put("text", text);
                    android.util.Log.d("ShortcutPlugin", "Shared text: " + text);
                }
            } else {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri != null) {
                    result.put("data", uri.toString());
                    android.util.Log.d("ShortcutPlugin", "Shared data URI: " + uri.toString());
                }
            }

            call.resolve(result);
        } else {
            android.util.Log.d("ShortcutPlugin", "No shared content found");
            call.resolve(null);
        }
    }
}
*/
