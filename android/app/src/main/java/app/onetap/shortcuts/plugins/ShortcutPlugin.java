/*
 * UNCOMMENT THIS ENTIRE FILE AFTER GIT PULL
 * 
 * To uncomment: Remove the block comment markers at the start and end of this file
 * (the /* at line 1 and the */ at the end)
 */

/*
package app.onetap.shortcuts.plugins;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "ShortcutPlugin",
    permissions = {
        @Permission(
            alias = "storage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        ),
        @Permission(
            alias = "mediaImages",
            strings = { "android.permission.READ_MEDIA_IMAGES" }
        ),
        @Permission(
            alias = "mediaVideo",
            strings = { "android.permission.READ_MEDIA_VIDEO" }
        )
    }
)
public class ShortcutPlugin extends Plugin {

    // 5MB threshold for file copying
    private static final long FILE_SIZE_THRESHOLD = 5 * 1024 * 1024;
    
    private PluginCall pendingPermissionCall;

    @PluginMethod
    public void createPinnedShortcut(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "createPinnedShortcut called");
        
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            android.util.Log.e("ShortcutPlugin", "Android version too old, need Oreo+");
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Android 8.0+ required");
            call.resolve(result);
            return;
        }

        Context context = getContext();
        if (context == null) {
            android.util.Log.e("ShortcutPlugin", "Context is null");
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Context is null");
            call.resolve(result);
            return;
        }

        ShortcutManager shortcutManager = context.getSystemService(ShortcutManager.class);

        if (!shortcutManager.isRequestPinShortcutSupported()) {
            android.util.Log.e("ShortcutPlugin", "Launcher does not support pinned shortcuts");
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Launcher does not support pinned shortcuts");
            call.resolve(result);
            return;
        }

        String id = call.getString("id");
        String label = call.getString("label");
        String intentAction = call.getString("intentAction", "android.intent.action.VIEW");
        String intentData = call.getString("intentData");
        String intentType = call.getString("intentType");
        
        // New: Check for base64 file data from web picker
        String fileData = call.getString("fileData");
        String fileName = call.getString("fileName");
        String fileMimeType = call.getString("fileMimeType");
        Integer fileSizeInt = call.getInt("fileSize");
        long fileSize = fileSizeInt != null ? fileSizeInt.longValue() : 0;

        android.util.Log.d("ShortcutPlugin", "Creating shortcut: id=" + id + ", label=" + label + 
            ", intentData=" + intentData + ", intentType=" + intentType + 
            ", hasFileData=" + (fileData != null) + ", fileSize=" + fileSize);

        if (id == null || label == null) {
            android.util.Log.e("ShortcutPlugin", "Missing required parameters");
            call.reject("Missing required parameters");
            return;
        }

        Uri dataUri = null;
        
        // Handle base64 file data from web picker
        if (fileData != null && fileName != null) {
            android.util.Log.d("ShortcutPlugin", "Processing base64 file data, size: " + fileSize);
            
            if (fileSize > 0 && fileSize <= FILE_SIZE_THRESHOLD) {
                // Small file: save to app storage and use FileProvider
                Uri savedUri = saveBase64ToAppStorage(context, fileData, id, fileMimeType);
                if (savedUri != null) {
                    dataUri = savedUri;
                    android.util.Log.d("ShortcutPlugin", "Saved small file to app storage: " + savedUri);
                } else {
                    android.util.Log.e("ShortcutPlugin", "Failed to save file to app storage");
                    JSObject result = new JSObject();
                    result.put("success", false);
                    result.put("error", "Failed to save file");
                    call.resolve(result);
                    return;
                }
            } else if (fileSize > FILE_SIZE_THRESHOLD) {
                // Large file: still save but warn
                android.util.Log.w("ShortcutPlugin", "File is larger than 5MB, attempting to save anyway");
                Uri savedUri = saveBase64ToAppStorage(context, fileData, id, fileMimeType);
                if (savedUri != null) {
                    dataUri = savedUri;
                } else {
                    JSObject result = new JSObject();
                    result.put("success", false);
                    result.put("error", "File too large to process");
                    call.resolve(result);
                    return;
                }
            } else {
                // Unknown size, try to save
                Uri savedUri = saveBase64ToAppStorage(context, fileData, id, fileMimeType);
                if (savedUri != null) {
                    dataUri = savedUri;
                }
            }
        } else if (intentData != null) {
            // Handle content:// or file:// URIs
            dataUri = Uri.parse(intentData);
            String scheme = dataUri.getScheme();
            
            android.util.Log.d("ShortcutPlugin", "URI scheme: " + scheme);
            
            if ("content".equals(scheme) && intentType != null) {
                // Check file size
                long contentSize = getContentSize(context, dataUri);
                android.util.Log.d("ShortcutPlugin", "Content size: " + contentSize);
                
                if (contentSize > 0 && contentSize <= FILE_SIZE_THRESHOLD) {
                    // Small file: copy to app storage
                    Uri persistentUri = copyToAppStorage(context, dataUri, id, intentType);
                    if (persistentUri != null) {
                        dataUri = persistentUri;
                        android.util.Log.d("ShortcutPlugin", "Copied small file to app storage: " + persistentUri);
                    }
                } else if (contentSize > FILE_SIZE_THRESHOLD) {
                    // Large file: try to get the real file path
                    String realPath = getRealPathFromUri(context, dataUri);
                    if (realPath != null) {
                        dataUri = Uri.fromFile(new File(realPath));
                        android.util.Log.d("ShortcutPlugin", "Using direct file path for large file: " + realPath);
                    } else {
                        // Fall back to copying (may fail for very large files)
                        android.util.Log.w("ShortcutPlugin", "Could not get real path, attempting copy");
                        Uri persistentUri = copyToAppStorage(context, Uri.parse(intentData), id, intentType);
                        if (persistentUri != null) {
                            dataUri = persistentUri;
                        }
                    }
                } else {
                    // Unknown size, try to copy
                    Uri persistentUri = copyToAppStorage(context, dataUri, id, intentType);
                    if (persistentUri != null) {
                        dataUri = persistentUri;
                    }
                }
            }
        }
        
        if (dataUri == null) {
            android.util.Log.e("ShortcutPlugin", "No valid URI for shortcut");
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "No valid file URI");
            call.resolve(result);
            return;
        }

        // Create the intent with Samsung compatibility fixes
        Intent intent = createCompatibleIntent(context, intentAction, dataUri, intentType);

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
    
    // Create intent with Samsung and other launcher compatibility fixes
    private Intent createCompatibleIntent(Context context, String action, Uri dataUri, String mimeType) {
        Intent intent = new Intent(action);
        
        // CRITICAL: Use setDataAndType() when both are present
        if (mimeType != null && !mimeType.isEmpty()) {
            intent.setDataAndType(dataUri, mimeType);
            android.util.Log.d("ShortcutPlugin", "Set data AND type: " + dataUri + " / " + mimeType);
        } else {
            intent.setData(dataUri);
            android.util.Log.d("ShortcutPlugin", "Set data only: " + dataUri);
        }
        
        // Add flags for proper file access and new task
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        
        // Samsung compatibility: Add persistable URI permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        }
        
        // Grant URI permission to all apps that can handle this intent
        String scheme = dataUri.getScheme();
        if ("content".equals(scheme)) {
            try {
                // Grant permission to all potential handlers
                List<android.content.pm.ResolveInfo> resolveInfos = 
                    context.getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
                
                for (android.content.pm.ResolveInfo resolveInfo : resolveInfos) {
                    String packageName = resolveInfo.activityInfo.packageName;
                    context.grantUriPermission(packageName, dataUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    android.util.Log.d("ShortcutPlugin", "Granted URI permission to: " + packageName);
                }
            } catch (Exception e) {
                android.util.Log.e("ShortcutPlugin", "Error granting URI permissions: " + e.getMessage());
            }
        }
        
        return intent;
    }
    
    // Save base64 data to app storage and return FileProvider URI
    private Uri saveBase64ToAppStorage(Context context, String base64Data, String id, String mimeType) {
        try {
            // Decode base64
            byte[] data = Base64.decode(base64Data, Base64.DEFAULT);
            android.util.Log.d("ShortcutPlugin", "Decoded base64 data, size: " + data.length);
            
            // Create shortcuts directory
            File shortcutsDir = new File(context.getFilesDir(), "shortcuts");
            if (!shortcutsDir.exists()) {
                shortcutsDir.mkdirs();
            }
            
            // Determine file extension
            String extension = getExtensionFromMimeType(mimeType);
            String filename = id + extension;
            File destFile = new File(shortcutsDir, filename);
            
            android.util.Log.d("ShortcutPlugin", "Saving to: " + destFile.getAbsolutePath());
            
            // Write file
            try (FileOutputStream fos = new FileOutputStream(destFile)) {
                fos.write(data);
            }
            
            android.util.Log.d("ShortcutPlugin", "File saved successfully, size: " + destFile.length());
            
            // Create FileProvider URI
            String authority = context.getPackageName() + ".fileprovider";
            Uri fileProviderUri = FileProvider.getUriForFile(context, authority, destFile);
            
            android.util.Log.d("ShortcutPlugin", "FileProvider URI: " + fileProviderUri);
            
            return fileProviderUri;
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error saving base64 to app storage: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }
    
    // Get file size from content:// URI
    private long getContentSize(Context context, Uri uri) {
        try {
            Cursor cursor = context.getContentResolver().query(uri, null, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (sizeIndex >= 0) {
                    long size = cursor.getLong(sizeIndex);
                    cursor.close();
                    return size;
                }
                cursor.close();
            }
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting content size: " + e.getMessage());
        }
        return -1;
    }
    
    // Try to get the real file path from a content:// URI
    private String getRealPathFromUri(Context context, Uri uri) {
        String result = null;
        
        try {
            // Try MediaStore for images/videos
            if (uri.getAuthority() != null && uri.getAuthority().contains("media")) {
                String[] projection = { MediaStore.Images.Media.DATA };
                Cursor cursor = context.getContentResolver().query(uri, projection, null, null, null);
                if (cursor != null) {
                    int columnIndex = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA);
                    if (cursor.moveToFirst()) {
                        result = cursor.getString(columnIndex);
                    }
                    cursor.close();
                }
            }
            
            // Try document provider
            if (result == null && "content".equals(uri.getScheme())) {
                // For downloads and other document providers
                Cursor cursor = context.getContentResolver().query(uri, null, null, null, null);
                if (cursor != null && cursor.moveToFirst()) {
                    int displayNameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (displayNameIndex >= 0) {
                        String displayName = cursor.getString(displayNameIndex);
                        // Check common locations
                        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        File possibleFile = new File(downloads, displayName);
                        if (possibleFile.exists()) {
                            result = possibleFile.getAbsolutePath();
                        }
                    }
                    cursor.close();
                }
            }
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting real path: " + e.getMessage());
        }
        
        android.util.Log.d("ShortcutPlugin", "Real path for " + uri + ": " + result);
        return result;
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
        
        // Try to get extension from MimeTypeMap first
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        if (extension != null) {
            return "." + extension;
        }
        
        // Fallback for common types
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
    
    @PluginMethod
    public void saveFileFromBase64(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "saveFileFromBase64 called");
        
        String base64Data = call.getString("base64Data");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType");
        
        if (base64Data == null || fileName == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Missing base64Data or fileName");
            call.resolve(result);
            return;
        }
        
        Context context = getContext();
        Uri savedUri = saveBase64ToAppStorage(context, base64Data, fileName, mimeType);
        
        JSObject result = new JSObject();
        if (savedUri != null) {
            result.put("success", true);
            result.put("filePath", savedUri.toString());
        } else {
            result.put("success", false);
            result.put("error", "Failed to save file");
        }
        call.resolve(result);
    }
    
    @PluginMethod
    public void resolveContentUri(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "resolveContentUri called");
        
        String contentUri = call.getString("contentUri");
        if (contentUri == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Missing contentUri");
            call.resolve(result);
            return;
        }
        
        Uri uri = Uri.parse(contentUri);
        String realPath = getRealPathFromUri(getContext(), uri);
        
        JSObject result = new JSObject();
        if (realPath != null) {
            result.put("success", true);
            result.put("filePath", realPath);
        } else {
            result.put("success", false);
            result.put("error", "Could not resolve URI to file path");
        }
        call.resolve(result);
    }
    
    @PluginMethod
    public void requestStoragePermission(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "requestStoragePermission called");
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ uses granular media permissions
            if (getPermissionState("mediaImages") == com.getcapacitor.PermissionState.GRANTED) {
                JSObject result = new JSObject();
                result.put("granted", true);
                call.resolve(result);
                return;
            }
            pendingPermissionCall = call;
            requestPermissionForAlias("mediaImages", call, "storagePermissionCallback");
        } else {
            // Android 12 and below
            if (getPermissionState("storage") == com.getcapacitor.PermissionState.GRANTED) {
                JSObject result = new JSObject();
                result.put("granted", true);
                call.resolve(result);
                return;
            }
            pendingPermissionCall = call;
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
        }
    }
    
    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            result.put("granted", getPermissionState("mediaImages") == com.getcapacitor.PermissionState.GRANTED);
        } else {
            result.put("granted", getPermissionState("storage") == com.getcapacitor.PermissionState.GRANTED);
        }
        
        call.resolve(result);
    }
    
    @PluginMethod
    public void listDirectory(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "listDirectory called");
        
        String path = call.getString("path");
        if (path == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Missing path");
            call.resolve(result);
            return;
        }
        
        File directory = new File(path);
        if (!directory.exists() || !directory.isDirectory()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Directory does not exist");
            call.resolve(result);
            return;
        }
        
        File[] files = directory.listFiles();
        JSArray fileArray = new JSArray();
        
        if (files != null) {
            for (File file : files) {
                JSObject fileInfo = new JSObject();
                fileInfo.put("name", file.getName());
                fileInfo.put("path", file.getAbsolutePath());
                fileInfo.put("isDirectory", file.isDirectory());
                fileInfo.put("size", file.length());
                
                if (!file.isDirectory()) {
                    String mimeType = getMimeTypeFromFile(file);
                    if (mimeType != null) {
                        fileInfo.put("mimeType", mimeType);
                    }
                }
                
                fileArray.put(fileInfo);
            }
        }
        
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("files", fileArray);
        call.resolve(result);
    }
    
    @PluginMethod
    public void getFileInfo(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "getFileInfo called");
        
        String path = call.getString("path");
        if (path == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Missing path");
            call.resolve(result);
            return;
        }
        
        File file = new File(path);
        if (!file.exists()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "File does not exist");
            call.resolve(result);
            return;
        }
        
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("name", file.getName());
        result.put("path", file.getAbsolutePath());
        result.put("size", file.length());
        result.put("isDirectory", file.isDirectory());
        
        if (!file.isDirectory()) {
            String mimeType = getMimeTypeFromFile(file);
            if (mimeType != null) {
                result.put("mimeType", mimeType);
            }
        }
        
        call.resolve(result);
    }
    
    private String getMimeTypeFromFile(File file) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(file.getName());
        if (extension != null) {
            return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase());
        }
        return null;
    }
}
*/
