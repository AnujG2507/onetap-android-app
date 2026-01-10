/*
 * UNCOMMENT THIS ENTIRE FILE AFTER GIT PULL
 * 
 * To uncomment: Remove the block comment markers at the start and end of this file
 * (the /* at line 1 and the */ at the end)
 */

/*
package app.onetap.shortcuts.plugins;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.Icon;
import android.media.MediaMetadataRetriever;
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

import java.io.ByteArrayOutputStream;
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
        Boolean useVideoProxy = call.getBoolean("useVideoProxy", false);
        
        // Check for base64 file data from web picker
        String fileData = call.getString("fileData");
        String fileName = call.getString("fileName");
        String fileMimeType = call.getString("fileMimeType");
        Integer fileSizeInt = call.getInt("fileSize");
        long fileSize = fileSizeInt != null ? fileSizeInt.longValue() : 0;

        android.util.Log.d("ShortcutPlugin", "Creating shortcut: id=" + id + ", label=" + label + 
            ", intentData=" + intentData + ", intentType=" + intentType + 
            ", hasFileData=" + (fileData != null) + ", fileSize=" + fileSize +
            ", useVideoProxy=" + useVideoProxy);

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
                Uri savedUri = saveBase64ToAppStorage(context, fileData, id, fileMimeType);
                if (savedUri != null) {
                    dataUri = savedUri;
                }
            }
        } else if (intentData != null) {
            dataUri = Uri.parse(intentData);
            String scheme = dataUri.getScheme();
            
            android.util.Log.d("ShortcutPlugin", "URI scheme: " + scheme);
            
            if ("content".equals(scheme) && intentType != null) {
                long contentSize = getContentSize(context, dataUri);
                android.util.Log.d("ShortcutPlugin", "Content size: " + contentSize);

                Uri persistentUri = copyToAppStorage(context, dataUri, id, intentType);
                if (persistentUri != null) {
                    dataUri = persistentUri;
                    android.util.Log.d("ShortcutPlugin", "Copied file to app storage: " + persistentUri);
                } else {
                    android.util.Log.w("ShortcutPlugin", "Copy failed; falling back to original content URI");
                    persistReadPermissionIfPossible(context, dataUri);
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

        // Create intent - use VideoProxyActivity for videos to handle permission granting at tap time
        Intent intent;
        if (useVideoProxy != null && useVideoProxy) {
            android.util.Log.d("ShortcutPlugin", "Using VideoProxyActivity for video shortcut");
            intent = new Intent(context, VideoProxyActivity.class);
            intent.setAction("app.onetap.OPEN_VIDEO");
            intent.setDataAndType(dataUri, intentType != null ? intentType : "video/*");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            intent = createCompatibleIntent(context, intentAction, dataUri, intentType);
        }

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
    
    @PluginMethod
    public void clearSharedIntent(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "clearSharedIntent called");
        
        if (getActivity() != null) {
            // Replace with a blank intent to prevent re-processing
            Intent blankIntent = new Intent();
            blankIntent.setAction(Intent.ACTION_MAIN);
            getActivity().setIntent(blankIntent);
            android.util.Log.d("ShortcutPlugin", "Intent cleared");
        }
        
        call.resolve();
    }
    
    // Create intent with Samsung and other launcher compatibility fixes
    private Intent createCompatibleIntent(Context context, String action, Uri dataUri, String mimeType) {
        Intent intent = new Intent(action);

        // CRITICAL: Detect MIME type if not provided or if it's generic
        String resolvedMimeType = mimeType;
        if (resolvedMimeType == null || resolvedMimeType.isEmpty() || "*/*".equals(resolvedMimeType)) {
            // Try to detect from URI
            resolvedMimeType = detectMimeType(context, dataUri);
            android.util.Log.d("ShortcutPlugin", "Detected MIME type: " + resolvedMimeType);
        }

        // CRITICAL: Use setDataAndType() when both are present
        if (resolvedMimeType != null && !resolvedMimeType.isEmpty() && !"*/*".equals(resolvedMimeType)) {
            intent.setDataAndType(dataUri, resolvedMimeType);
            android.util.Log.d("ShortcutPlugin", "Set data AND type: " + dataUri + " / " + resolvedMimeType);
        } else {
            intent.setData(dataUri);
            android.util.Log.d("ShortcutPlugin", "Set data only (no MIME): " + dataUri);
        }

        // Add flags for proper file access and new task
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        // Samsung compatibility: Add persistable URI permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        }

        // IMPORTANT: Some launchers only propagate URI grants reliably when ClipData is set
        if ("content".equals(dataUri.getScheme())) {
            try {
                intent.setClipData(ClipData.newUri(context.getContentResolver(), "onetap-file", dataUri));
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "Failed to set ClipData: " + e.getMessage());
            }
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
    // Uses chunked processing to avoid OOM for large files
    private Uri saveBase64ToAppStorage(Context context, String base64Data, String id, String mimeType) {
        try {
            // Check if base64 data is too large (rough estimate: base64 is ~1.33x original size)
            // If base64 string is > 20MB, it's likely to cause OOM
            if (base64Data.length() > 20 * 1024 * 1024) {
                android.util.Log.e("ShortcutPlugin", "Base64 data too large, would cause OOM: " + base64Data.length());
                return null;
            }
            
            // Decode base64 with OOM handling
            byte[] data;
            try {
                data = Base64.decode(base64Data, Base64.DEFAULT);
            } catch (OutOfMemoryError e) {
                android.util.Log.e("ShortcutPlugin", "OutOfMemoryError decoding base64: " + e.getMessage());
                // Try to force garbage collection and retry with smaller chunks
                System.gc();
                return null;
            }
            
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
            
            // Free memory
            data = null;
            System.gc();
            
            android.util.Log.d("ShortcutPlugin", "File saved successfully, size: " + destFile.length());
            
            // Create FileProvider URI
            String authority = context.getPackageName() + ".fileprovider";
            Uri fileProviderUri = FileProvider.getUriForFile(context, authority, destFile);
            
            android.util.Log.d("ShortcutPlugin", "FileProvider URI: " + fileProviderUri);
            
            return fileProviderUri;
        } catch (OutOfMemoryError e) {
            android.util.Log.e("ShortcutPlugin", "OutOfMemoryError saving file: " + e.getMessage());
            System.gc();
            return null;
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

    // Best-effort: persist URI read permission for SAF/document URIs (won't work for all providers)
    private void persistReadPermissionIfPossible(Context context, Uri uri) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) return;
        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            context.getContentResolver().takePersistableUriPermission(uri, flags);
            android.util.Log.d("ShortcutPlugin", "Persisted read permission for URI: " + uri);
        } catch (SecurityException se) {
            android.util.Log.w("ShortcutPlugin", "Cannot persist URI permission (SecurityException): " + se.getMessage());
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "Cannot persist URI permission: " + e.getMessage());
        }
    }
    private String getRealPathFromUri(Context context, Uri uri) {
        String result = null;
        
        try {
            // Try MediaStore for images/videos - use _data column which works for both
            if (uri.getAuthority() != null && uri.getAuthority().contains("media")) {
                // Use "_data" directly as it works for all media types (images, video, audio)
                String[] projection = { "_data" };
                Cursor cursor = context.getContentResolver().query(uri, projection, null, null, null);
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        int columnIndex = cursor.getColumnIndex("_data");
                        if (columnIndex >= 0) {
                            result = cursor.getString(columnIndex);
                        }
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
                        File[] possibleLocations = {
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES),
                            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "Camera")
                        };
                        
                        for (File location : possibleLocations) {
                            File possibleFile = new File(location, displayName);
                            if (possibleFile.exists()) {
                                result = possibleFile.getAbsolutePath();
                                break;
                            }
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
    
    // Detect MIME type from URI using various methods
    private String detectMimeType(Context context, Uri uri) {
        String mimeType = null;
        
        // Method 1: Try ContentResolver
        try {
            mimeType = context.getContentResolver().getType(uri);
            if (mimeType != null && !mimeType.isEmpty() && !"*/*".equals(mimeType)) {
                android.util.Log.d("ShortcutPlugin", "MIME from ContentResolver: " + mimeType);
                return mimeType;
            }
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting MIME from ContentResolver: " + e.getMessage());
        }
        
        // Method 2: Try file extension from URI path
        String path = uri.getPath();
        if (path != null) {
            String extension = MimeTypeMap.getFileExtensionFromUrl(path);
            if (extension != null && !extension.isEmpty()) {
                mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase());
                if (mimeType != null) {
                    android.util.Log.d("ShortcutPlugin", "MIME from extension '" + extension + "': " + mimeType);
                    return mimeType;
                }
            }
            
            // Try manual extraction if URL parser fails
            int dotIndex = path.lastIndexOf('.');
            if (dotIndex >= 0) {
                extension = path.substring(dotIndex + 1).toLowerCase();
                mimeType = getMimeTypeFromExtension(extension);
                if (mimeType != null) {
                    android.util.Log.d("ShortcutPlugin", "MIME from manual extension '" + extension + "': " + mimeType);
                    return mimeType;
                }
            }
        }
        
        // Method 3: Try to get real file path and check its extension
        String realPath = getRealPathFromUri(context, uri);
        if (realPath != null) {
            int dotIndex = realPath.lastIndexOf('.');
            if (dotIndex >= 0) {
                String extension = realPath.substring(dotIndex + 1).toLowerCase();
                mimeType = getMimeTypeFromExtension(extension);
                if (mimeType != null) {
                    android.util.Log.d("ShortcutPlugin", "MIME from real path extension '" + extension + "': " + mimeType);
                    return mimeType;
                }
            }
        }
        
        return null;
    }
    
    // Get MIME type from file extension
    private String getMimeTypeFromExtension(String extension) {
        if (extension == null) return null;
        
        switch (extension.toLowerCase()) {
            // Images
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "png":
                return "image/png";
            case "gif":
                return "image/gif";
            case "webp":
                return "image/webp";
            case "bmp":
                return "image/bmp";
            case "heic":
                return "image/heic";
            case "heif":
                return "image/heif";
            // Videos
            case "mp4":
                return "video/mp4";
            case "webm":
                return "video/webm";
            case "mov":
                return "video/quicktime";
            case "avi":
                return "video/x-msvideo";
            case "mkv":
                return "video/x-matroska";
            case "3gp":
                return "video/3gpp";
            // Documents
            case "pdf":
                return "application/pdf";
            case "doc":
                return "application/msword";
            case "docx":
                return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "txt":
                return "text/plain";
            case "rtf":
                return "application/rtf";
            case "xls":
                return "application/vnd.ms-excel";
            case "xlsx":
                return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "ppt":
                return "application/vnd.ms-powerpoint";
            case "pptx":
                return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            default:
                // Try system MimeTypeMap
                String systemMime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                return systemMime;
        }
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
        // Priority 1: Base64 icon data (thumbnail from web)
        String iconData = call.getString("iconData");
        if (iconData != null && !iconData.isEmpty()) {
            android.util.Log.d("ShortcutPlugin", "Creating icon from base64 data");
            Icon icon = createBitmapIcon(iconData);
            if (icon != null) {
                return icon;
            }
        }
        
        // Priority 2: Icon URI (data URL or file URI)
        String iconUri = call.getString("iconUri");
        if (iconUri != null && !iconUri.isEmpty()) {
            android.util.Log.d("ShortcutPlugin", "Creating icon from URI: " + iconUri.substring(0, Math.min(50, iconUri.length())));
            
            // Handle data: URLs
            if (iconUri.startsWith("data:")) {
                // Extract base64 portion
                int commaIndex = iconUri.indexOf(",");
                if (commaIndex > 0) {
                    String base64Part = iconUri.substring(commaIndex + 1);
                    Icon icon = createBitmapIcon(base64Part);
                    if (icon != null) {
                        return icon;
                    }
                }
            }
            
            // Handle content: or file: URIs
            if (iconUri.startsWith("content:") || iconUri.startsWith("file:")) {
                try {
                    Uri uri = Uri.parse(iconUri);
                    Icon icon = createIconFromUri(uri);
                    if (icon != null) {
                        return icon;
                    }
                } catch (Exception e) {
                    android.util.Log.e("ShortcutPlugin", "Error creating icon from URI: " + e.getMessage());
                }
            }
        }
        
        // Priority 3: Emoji icon
        String emoji = call.getString("iconEmoji");
        if (emoji != null) {
            android.util.Log.d("ShortcutPlugin", "Creating emoji icon: " + emoji);
            return createEmojiIcon(emoji);
        }

        // Priority 4: Text icon
        String text = call.getString("iconText");
        if (text != null) {
            android.util.Log.d("ShortcutPlugin", "Creating text icon: " + text);
            return createTextIcon(text);
        }

        android.util.Log.d("ShortcutPlugin", "Using default icon");
        return Icon.createWithResource(getContext(), android.R.drawable.ic_menu_add);
    }
    
    // Create icon from base64 image data
    private Icon createBitmapIcon(String base64Data) {
        try {
            byte[] decoded = Base64.decode(base64Data, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
            
            if (bitmap == null) {
                android.util.Log.e("ShortcutPlugin", "Failed to decode base64 to bitmap");
                return null;
            }
            
            // Scale to 192x192 for shortcut icon
            int size = 192;
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, size, size, true);
            
            // Recycle original if it's different from scaled
            if (scaled != bitmap) {
                bitmap.recycle();
            }
            
            android.util.Log.d("ShortcutPlugin", "Created bitmap icon: " + scaled.getWidth() + "x" + scaled.getHeight());
            return Icon.createWithBitmap(scaled);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error creating bitmap icon: " + e.getMessage());
            return null;
        }
    }
    
    // Create icon from content/file URI
    private Icon createIconFromUri(Uri uri) {
        try {
            Context context = getContext();
            InputStream inputStream = context.getContentResolver().openInputStream(uri);
            if (inputStream == null) {
                return null;
            }
            
            Bitmap bitmap = BitmapFactory.decodeStream(inputStream);
            inputStream.close();
            
            if (bitmap == null) {
                return null;
            }
            
            // Scale to 192x192
            int size = 192;
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, size, size, true);
            
            if (scaled != bitmap) {
                bitmap.recycle();
            }
            
            return Icon.createWithBitmap(scaled);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error creating icon from URI: " + e.getMessage());
            return null;
        }
    }
    
    // Create video thumbnail for shortcut icon
    private Icon createVideoThumbnailIcon(Context context, Uri videoUri) {
        try {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            retriever.setDataSource(context, videoUri);
            
            // Get a frame at 1 second (or first frame)
            Bitmap frame = retriever.getFrameAtTime(1000000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            retriever.release();
            
            if (frame == null) {
                android.util.Log.w("ShortcutPlugin", "Could not extract video frame");
                return null;
            }
            
            // Scale to 192x192
            int size = 192;
            Bitmap scaled = Bitmap.createScaledBitmap(frame, size, size, true);
            
            if (scaled != frame) {
                frame.recycle();
            }
            
            android.util.Log.d("ShortcutPlugin", "Created video thumbnail icon");
            return Icon.createWithBitmap(scaled);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error creating video thumbnail: " + e.getMessage());
            return null;
        }
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
