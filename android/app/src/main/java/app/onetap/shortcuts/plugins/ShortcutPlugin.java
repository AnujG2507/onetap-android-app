/*
 * UNCOMMENT THIS ENTIRE FILE AFTER GIT PULL
 * 
 * To uncomment: Remove the block comment markers at the start and end of this file
 * (the /* at line 1 and the */ at the end)
 */

/*
package app.onetap.shortcuts.plugins;

import android.content.ContentResolver;
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

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

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

        android.util.Log.d("ShortcutPlugin", "Creating shortcut: id=" + id + ", label=" + label + ", intentData=" + intentData + ", intentType=" + intentType);

        if (id == null || label == null || intentData == null) {
            android.util.Log.e("ShortcutPlugin", "Missing required parameters");
            call.reject("Missing required parameters");
            return;
        }

        // Handle content:// URIs - need to copy file to app storage for persistent access
        Uri dataUri = Uri.parse(intentData);
        String scheme = dataUri.getScheme();
        
        android.util.Log.d("ShortcutPlugin", "URI scheme: " + scheme);
        
        if ("content".equals(scheme) && intentType != null) {
            // Copy the file to app's private storage and create a FileProvider URI
            try {
                Uri persistentUri = copyToAppStorage(context, dataUri, id, intentType);
                if (persistentUri != null) {
                    dataUri = persistentUri;
                    android.util.Log.d("ShortcutPlugin", "Copied file to app storage, new URI: " + persistentUri);
                } else {
                    android.util.Log.w("ShortcutPlugin", "Failed to copy file, using original URI");
                }
            } catch (Exception e) {
                android.util.Log.e("ShortcutPlugin", "Error copying file: " + e.getMessage());
            }
        }

        Intent intent = new Intent(intentAction);
        
        // CRITICAL: Use setDataAndType() when both are present
        // Calling setData() and setType() separately clears the other!
        if (intentType != null && !intentType.isEmpty()) {
            intent.setDataAndType(dataUri, intentType);
            android.util.Log.d("ShortcutPlugin", "Set data AND type: " + dataUri + " / " + intentType);
        } else {
            intent.setData(dataUri);
            android.util.Log.d("ShortcutPlugin", "Set data only: " + dataUri);
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
    
    private Uri copyToAppStorage(Context context, Uri sourceUri, String id, String mimeType) {
        try {
            // Create shortcuts directory in app's files dir
            File shortcutsDir = new File(context.getFilesDir(), "shortcuts");
            if (!shortcutsDir.exists()) {
                shortcutsDir.mkdirs();
            }
            
            // Determine file extension from MIME type
            String extension = getExtensionFromMimeType(mimeType);
            String filename = id + extension;
            File destFile = new File(shortcutsDir, filename);
            
            android.util.Log.d("ShortcutPlugin", "Copying to: " + destFile.getAbsolutePath());
            
            // Copy the file
            ContentResolver resolver = context.getContentResolver();
            try (InputStream in = resolver.openInputStream(sourceUri);
                 OutputStream out = new FileOutputStream(destFile)) {
                
                if (in == null) {
                    android.util.Log.e("ShortcutPlugin", "Could not open input stream for URI");
                    return null;
                }
                
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
            }
            
            android.util.Log.d("ShortcutPlugin", "File copied successfully, size: " + destFile.length());
            
            // Create FileProvider URI for the copied file
            String authority = context.getPackageName() + ".fileprovider";
            Uri fileProviderUri = FileProvider.getUriForFile(context, authority, destFile);
            
            android.util.Log.d("ShortcutPlugin", "FileProvider URI: " + fileProviderUri);
            
            return fileProviderUri;
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error in copyToAppStorage: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }
    
    private String getExtensionFromMimeType(String mimeType) {
        if (mimeType == null) return "";
        
        switch (mimeType) {
            // Images
            case "image/jpeg": return ".jpg";
            case "image/png": return ".png";
            case "image/gif": return ".gif";
            case "image/webp": return ".webp";
            case "image/bmp": return ".bmp";
            case "image/heic": return ".heic";
            case "image/heif": return ".heif";
            // Videos
            case "video/mp4": return ".mp4";
            case "video/webm": return ".webm";
            case "video/quicktime": return ".mov";
            case "video/x-msvideo": return ".avi";
            case "video/x-matroska": return ".mkv";
            case "video/3gpp": return ".3gp";
            // Documents
            case "application/pdf": return ".pdf";
            case "application/msword": return ".doc";
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return ".docx";
            case "text/plain": return ".txt";
            case "application/rtf": return ".rtf";
            case "application/vnd.ms-excel": return ".xls";
            case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return ".xlsx";
            case "application/vnd.ms-powerpoint": return ".ppt";
            case "application/vnd.openxmlformats-officedocument.presentationml.presentation": return ".pptx";
            default:
                // Try to extract from generic types
                if (mimeType.startsWith("image/")) return ".jpg";
                if (mimeType.startsWith("video/")) return ".mp4";
                return "";
        }
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
