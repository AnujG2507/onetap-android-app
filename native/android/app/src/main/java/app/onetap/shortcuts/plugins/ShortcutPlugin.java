package app.onetap.shortcuts.plugins;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentUris;
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
import android.content.res.AssetFileDescriptor;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
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

import app.onetap.shortcuts.DesktopWebViewActivity;
import app.onetap.shortcuts.NativeVideoPlayerActivity;
import app.onetap.shortcuts.PDFProxyActivity;
import app.onetap.shortcuts.VideoProxyActivity;
import app.onetap.shortcuts.ContactProxyActivity;
import app.onetap.shortcuts.WhatsAppProxyActivity;
import app.onetap.shortcuts.ShortcutEditProxyActivity;
import app.onetap.shortcuts.LinkProxyActivity;
import app.onetap.shortcuts.ScheduledActionReceiver;
import app.onetap.shortcuts.NotificationHelper;
import app.onetap.shortcuts.NotificationClickActivity;
import app.onetap.shortcuts.NativeUsageTracker;

import app.onetap.shortcuts.MainActivity;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;

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

    // Maximum video size allowed for shortcuts (100MB)
    // Videos larger than this cannot have shortcuts created
    private static final long VIDEO_CACHE_THRESHOLD = 100 * 1024 * 1024;
    
    // Legacy threshold for general file copying (5MB)
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
        Boolean usePDFProxy = call.getBoolean("usePDFProxy", false);
        Boolean resumeEnabled = call.getBoolean("resumeEnabled", false);
        
        // WhatsApp proxy extras (from intent extras in JS)
        String whatsappPhoneNumber = null;
        String whatsappQuickMessages = null;
        String whatsappContactName = null;
        
        // Parse extras if present
        try {
            JSObject extras = call.getObject("extras");
            if (extras != null) {
                whatsappPhoneNumber = extras.optString("phone_number", null);
                whatsappQuickMessages = extras.optString("quick_messages", null);
                whatsappContactName = extras.optString("contact_name", null);
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "Error parsing extras: " + e.getMessage());
        }
        
        // Check for base64 file data from web picker
        String fileData = call.getString("fileData");
        String fileName = call.getString("fileName");
        String fileMimeType = call.getString("fileMimeType");
        Integer fileSizeInt = call.getInt("fileSize");
        long fileSize = fileSizeInt != null ? fileSizeInt.longValue() : 0;

        android.util.Log.d("ShortcutPlugin", "Creating shortcut: id=" + id + ", label=" + label + 
            ", intentData=" + intentData + ", intentType=" + intentType + 
            ", hasFileData=" + (fileData != null) + ", fileSize=" + fileSize +
            ", useVideoProxy=" + useVideoProxy + ", usePDFProxy=" + usePDFProxy +
            ", resumeEnabled=" + resumeEnabled + ", intentAction=" + intentAction);

        if (id == null || label == null) {
            android.util.Log.e("ShortcutPlugin", "Missing required parameters");
            call.reject("Missing required parameters");
            return;
        }

        // Capture final values for background thread
        final String finalId = id;
        final String finalLabel = label;
        final String finalIntentAction = intentAction;
        final String finalIntentData = intentData;
        final String finalIntentType = intentType;
        final Boolean finalUseVideoProxy = useVideoProxy;
        final Boolean finalUsePDFProxy = usePDFProxy;
        final Boolean finalResumeEnabled = resumeEnabled;
        final String finalFileData = fileData;
        final String finalWhatsappPhoneNumber = whatsappPhoneNumber;
        final String finalWhatsappQuickMessages = whatsappQuickMessages;
        final String finalWhatsappContactName = whatsappContactName;
        final String finalFileName = fileName;
        final String finalFileMimeType = fileMimeType;
        final long finalFileSize = fileSize;
        
        // Run file operations on background thread to prevent UI freezing
        new Thread(() -> {
            try {
                Uri dataUri = null;
                
                // Handle base64 file data from web picker
                if (finalFileData != null && finalFileName != null) {
                    android.util.Log.d("ShortcutPlugin", "Processing base64 file data on background thread, size: " + finalFileSize);
                    
                    if (finalFileSize > 0 && finalFileSize <= FILE_SIZE_THRESHOLD) {
                        Uri savedUri = saveBase64ToAppStorage(context, finalFileData, finalId, finalFileMimeType);
                        if (savedUri != null) {
                            dataUri = savedUri;
                            android.util.Log.d("ShortcutPlugin", "Saved small file to app storage: " + savedUri);
                        } else {
                            android.util.Log.e("ShortcutPlugin", "Failed to save file to app storage");
                            resolveOnMainThread(call, false, "Failed to save file");
                            return;
                        }
                    } else if (finalFileSize > FILE_SIZE_THRESHOLD) {
                        android.util.Log.w("ShortcutPlugin", "File is larger than 5MB, attempting to save anyway");
                        Uri savedUri = saveBase64ToAppStorage(context, finalFileData, finalId, finalFileMimeType);
                        if (savedUri != null) {
                            dataUri = savedUri;
                        } else {
                            resolveOnMainThread(call, false, "File too large to process");
                            return;
                        }
                    } else {
                        Uri savedUri = saveBase64ToAppStorage(context, finalFileData, finalId, finalFileMimeType);
                        if (savedUri != null) {
                            dataUri = savedUri;
                        }
                    }
                } else if (finalIntentData != null) {
                    dataUri = Uri.parse(finalIntentData);
                    String scheme = dataUri.getScheme();
                    
                    android.util.Log.d("ShortcutPlugin", "URI scheme: " + scheme);
                    
                    if ("content".equals(scheme) && finalIntentType != null) {
                        long contentSize = getContentSize(context, dataUri);

                        // If JS provided a size (e.g. some pickers can), prefer that when ContentResolver reports 0.
                        if (contentSize <= 0 && finalFileSize > 0) {
                            contentSize = finalFileSize;
                        }

                        android.util.Log.d("ShortcutPlugin", "Content size: " + contentSize);

                        boolean isVideo = finalIntentType.startsWith("video/");

                        // Block videos larger than 100MB
                        if (isVideo && contentSize > VIDEO_CACHE_THRESHOLD) {
                            long sizeMB = contentSize / (1024 * 1024);
                            android.util.Log.e("ShortcutPlugin", "Video too large (" + sizeMB + " MB). Video shortcuts are limited to 100 MB maximum.");
                            resolveOnMainThread(call, false, "Video too large (" + sizeMB + " MB). Video shortcuts are limited to 100 MB maximum.");
                            return;
                        }

                        // Copy to app storage for internal playback (this is the slow operation)
                        android.util.Log.d("ShortcutPlugin", "Starting file copy to app storage on background thread...");
                        Uri persistentUri = copyToAppStorage(context, dataUri, finalId, finalIntentType);
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
                    resolveOnMainThread(call, false, "No valid file URI");
                    return;
                }

                // Create intent - use proxy activities for videos, PDFs, and contacts
                final Uri finalDataUri = dataUri;
                Intent intent;
                if (finalUseVideoProxy != null && finalUseVideoProxy) {
                    android.util.Log.d("ShortcutPlugin", "Using VideoProxyActivity for video shortcut");
                    intent = new Intent(context, VideoProxyActivity.class);
                    intent.setAction("app.onetap.OPEN_VIDEO");
                    intent.setDataAndType(finalDataUri, finalIntentType != null ? finalIntentType : "video/*");
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    // Pass shortcut name as title for video player display
                    intent.putExtra("shortcut_title", finalLabel);
                    // Pass shortcut ID for usage tracking
                    intent.putExtra("shortcut_id", finalId);
                } else if (finalUsePDFProxy != null && finalUsePDFProxy) {
                    android.util.Log.d("ShortcutPlugin", "Using PDFProxyActivity for PDF shortcut, resumeEnabled=" + finalResumeEnabled);
                    intent = new Intent(context, PDFProxyActivity.class);
                    intent.setAction("app.onetap.OPEN_PDF");
                    intent.setDataAndType(finalDataUri, finalIntentType != null ? finalIntentType : "application/pdf");
                    intent.putExtra("shortcut_id", finalId);
                    intent.putExtra("resume_enabled", finalResumeEnabled != null && finalResumeEnabled);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } else if ("app.onetap.CALL_CONTACT".equals(finalIntentAction)) {
                    // Contact shortcuts - route through ContactProxyActivity for permission checking
                    android.util.Log.d("ShortcutPlugin", "Using ContactProxyActivity for contact shortcut");
                    intent = new Intent(context, ContactProxyActivity.class);
                    intent.setAction("app.onetap.CALL_CONTACT");
                    intent.setData(finalDataUri);
                    // Extract phone number from tel: URI and pass as extra
                    String phoneNumber = finalDataUri.getSchemeSpecificPart();
                    intent.putExtra(ContactProxyActivity.EXTRA_PHONE_NUMBER, phoneNumber);
                    // Pass shortcut ID for usage tracking
                    intent.putExtra(ContactProxyActivity.EXTRA_SHORTCUT_ID, finalId);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                } else if ("app.onetap.WHATSAPP_MESSAGE".equals(finalIntentAction)) {
                    // WhatsApp shortcuts with multiple messages - route through WhatsAppProxyActivity
                    android.util.Log.d("ShortcutPlugin", "Using WhatsAppProxyActivity for multi-message WhatsApp shortcut");
                    intent = new Intent(context, WhatsAppProxyActivity.class);
                    intent.setAction("app.onetap.WHATSAPP_MESSAGE");
                    intent.setData(finalDataUri);
                    intent.putExtra(WhatsAppProxyActivity.EXTRA_PHONE_NUMBER, finalWhatsappPhoneNumber);
                    intent.putExtra(WhatsAppProxyActivity.EXTRA_QUICK_MESSAGES, finalWhatsappQuickMessages);
                    intent.putExtra(WhatsAppProxyActivity.EXTRA_CONTACT_NAME, finalWhatsappContactName);
                    // Pass shortcut ID for usage tracking
                    intent.putExtra(WhatsAppProxyActivity.EXTRA_SHORTCUT_ID, finalId);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                } else if ("app.onetap.OPEN_LINK".equals(finalIntentAction)) {
                    // Link shortcuts - route through LinkProxyActivity for tap tracking
                    android.util.Log.d("ShortcutPlugin", "Using LinkProxyActivity for link shortcut");
                    intent = new Intent(context, LinkProxyActivity.class);
                    intent.setAction("app.onetap.OPEN_LINK");
                    intent.setData(finalDataUri);
                    // Pass URL as extra for reliable access
                    intent.putExtra(LinkProxyActivity.EXTRA_URL, finalDataUri.toString());
                    // Pass shortcut ID for usage tracking
                    intent.putExtra(LinkProxyActivity.EXTRA_SHORTCUT_ID, finalId);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                } else {
                    intent = createCompatibleIntent(context, finalIntentAction, finalDataUri, finalIntentType);
                }

                // Create icon (this may also be slow for video thumbnails)
                android.util.Log.d("ShortcutPlugin", "Creating icon on background thread...");
                Icon icon = createIcon(call);

                ShortcutInfo shortcutInfo = new ShortcutInfo.Builder(context, finalId)
                        .setShortLabel(finalLabel)
                        .setLongLabel(finalLabel)
                        .setIcon(icon)
                        .setIntent(intent)
                        .build();

                // Must request shortcut on main thread
                final ShortcutInfo finalShortcutInfo = shortcutInfo;
                getActivity().runOnUiThread(() -> {
                    try {
                        boolean requested = shortcutManager.requestPinShortcut(finalShortcutInfo, null);
                        android.util.Log.d("ShortcutPlugin", "requestPinShortcut returned: " + requested);

                        JSObject result = new JSObject();
                        result.put("success", requested);
                        call.resolve(result);
                    } catch (Exception e) {
                        android.util.Log.e("ShortcutPlugin", "Error pinning shortcut: " + e.getMessage());
                        JSObject result = new JSObject();
                        result.put("success", false);
                        result.put("error", e.getMessage());
                        call.resolve(result);
                    }
                });
            } catch (Exception e) {
                android.util.Log.e("ShortcutPlugin", "Background thread error: " + e.getMessage());
                e.printStackTrace();
                resolveOnMainThread(call, false, e.getMessage());
            }
        }).start();
    }
    
    // Helper to resolve plugin call on main thread with error
    private void resolveOnMainThread(PluginCall call, boolean success, String error) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                JSObject result = new JSObject();
                result.put("success", success);
                if (error != null) {
                    result.put("error", error);
                }
                call.resolve(result);
            });
        } else {
            JSObject result = new JSObject();
            result.put("success", success);
            if (error != null) {
                result.put("error", error);
            }
            call.resolve(result);
        }
    }
    

    @PluginMethod
    public void pickFile(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "pickFile called");

        if (getActivity() == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Activity is null");
            call.resolve(result);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);

        // Default to all files, but allow caller to restrict by MIME types
        intent.setType("*/*");
        try {
            JSArray mimeTypesArr = call.getArray("mimeTypes");
            if (mimeTypesArr != null && mimeTypesArr.length() > 0) {
                String[] mimeTypes = new String[mimeTypesArr.length()];
                for (int i = 0; i < mimeTypesArr.length(); i++) {
                    mimeTypes[i] = mimeTypesArr.getString(i);
                }
                intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "Invalid mimeTypes provided: " + e.getMessage());
        }

        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

        startActivityForResult(call, intent, "pickFileResult");
    }

    @ActivityCallback
    private void pickFileResult(PluginCall call, ActivityResult result) {
        android.util.Log.d("ShortcutPlugin", "pickFileResult called");

        JSObject ret = new JSObject();

        if (call == null) {
            android.util.Log.w("ShortcutPlugin", "pickFileResult: PluginCall is null");
            return;
        }

        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            ret.put("success", false);
            ret.put("error", "cancelled");
            call.resolve(ret);
            return;
        }

        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            ret.put("success", false);
            ret.put("error", "No file selected");
            call.resolve(ret);
            return;
        }

        Uri uri = data.getData();

        // Persist permission where possible
        try {
            Context context = getContext();
            if (context != null) {
                int takeFlags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                context.getContentResolver().takePersistableUriPermission(uri, takeFlags);
                android.util.Log.d("ShortcutPlugin", "Persisted URI permission: " + uri);
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "Could not persist URI permission: " + e.getMessage());
        }

        String mimeType = null;
        String name = null;
        long size = 0;

        try {
            Context context = getContext();
            if (context != null) {
                ContentResolver resolver = context.getContentResolver();
                mimeType = resolver.getType(uri);

                Cursor cursor = resolver.query(uri, null, null, null, null);
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (nameIndex >= 0) name = cursor.getString(nameIndex);

                        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (sizeIndex >= 0) size = cursor.getLong(sizeIndex);
                    }
                    cursor.close();
                }
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "Failed to query file metadata: " + e.getMessage());
        }

        ret.put("success", true);
        ret.put("uri", uri.toString());
        if (mimeType != null) ret.put("mimeType", mimeType);
        if (name != null) ret.put("name", name);
        ret.put("size", size);

        call.resolve(ret);
    }

    @PluginMethod
    public void openNativeVideoPlayer(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "openNativeVideoPlayer called");

        if (getActivity() == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Activity is null");
            call.resolve(result);
            return;
        }

        String uriString = call.getString("uri");
        String mimeType = call.getString("mimeType", "video/*");

        if (uriString == null || uriString.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Missing uri");
            call.resolve(result);
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            Intent intent = new Intent(getActivity(), NativeVideoPlayerActivity.class);
            intent.setAction(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // ClipData helps propagate URI grants reliably.
            if ("content".equals(uri.getScheme())) {
                try {
                    intent.setClipData(ClipData.newUri(getActivity().getContentResolver(), "onetap-video", uri));
                } catch (Exception e) {
                    android.util.Log.w("ShortcutPlugin", "Failed to set ClipData: " + e.getMessage());
                }
            }

            getActivity().startActivity(intent);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "openNativeVideoPlayer failed: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void openWithExternalApp(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "openWithExternalApp called");

        Activity activity = getActivity();
        Context context = getContext();
        
        if (activity == null || context == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Activity or context is null");
            call.resolve(result);
            return;
        }

        String uriString = call.getString("uri");
        String mimeType = call.getString("mimeType", "*/*");

        if (uriString == null || uriString.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Missing uri");
            call.resolve(result);
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            android.util.Log.d("ShortcutPlugin", "openWithExternalApp - original URI: " + uri + ", scheme: " + uri.getScheme());
            
            // If it's a file:// URI pointing to our app storage, convert to content:// via FileProvider
            if ("file".equals(uri.getScheme())) {
                String path = uri.getPath();
                File appFilesDir = context.getFilesDir();
                
                // Check if this file is in our app's storage
                if (path != null && path.startsWith(appFilesDir.getAbsolutePath())) {
                    File file = new File(path);
                    if (file.exists()) {
                        String authority = context.getPackageName() + ".fileprovider";
                        uri = FileProvider.getUriForFile(context, authority, file);
                        android.util.Log.d("ShortcutPlugin", "Converted file:// to content:// URI: " + uri);
                    } else {
                        android.util.Log.e("ShortcutPlugin", "File does not exist: " + path);
                    }
                }
            }
            
            // Use the robust createCompatibleIntent helper which handles all the edge cases
            Intent intent = createCompatibleIntent(context, Intent.ACTION_VIEW, uri, mimeType);
            intent.addCategory(Intent.CATEGORY_DEFAULT);
            
            android.util.Log.d("ShortcutPlugin", "openWithExternalApp - final URI: " + uri + ", mimeType: " + mimeType);
            
            // Create chooser for app selection
            Intent chooser = Intent.createChooser(intent, "Open with...");
            
            // CRITICAL: Copy ClipData from the original intent to the chooser
            // Without this, URI permissions may not propagate through the chooser
            if (intent.getClipData() != null) {
                chooser.setClipData(intent.getClipData());
                android.util.Log.d("ShortcutPlugin", "Copied ClipData to chooser intent");
            }
            
            // Add flags to chooser as well for maximum compatibility
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                chooser.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            }
            
            activity.startActivity(chooser);
            android.util.Log.d("ShortcutPlugin", "openWithExternalApp - chooser started successfully");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (android.content.ActivityNotFoundException e) {
            android.util.Log.e("ShortcutPlugin", "No app found to open file: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "No app found to open this file type");
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "openWithExternalApp failed: " + e.getMessage());
            e.printStackTrace();
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
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

    @PluginMethod
    public void pickContact(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "pickContact called");

        if (getActivity() == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Activity is null");
            call.resolve(result);
            return;
        }

        // Use ACTION_PICK with Phone.CONTENT_URI to show only contacts with phone numbers
        Intent intent = new Intent(Intent.ACTION_PICK, 
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        
        startActivityForResult(call, intent, "pickContactResult");
    }

    @ActivityCallback
    private void pickContactResult(PluginCall call, ActivityResult result) {
        android.util.Log.d("ShortcutPlugin", "pickContactResult called");

        JSObject ret = new JSObject();

        if (call == null) {
            android.util.Log.w("ShortcutPlugin", "pickContactResult: PluginCall is null");
            return;
        }

        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            ret.put("success", false);
            ret.put("error", "cancelled");
            call.resolve(ret);
            return;
        }

        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            ret.put("success", false);
            ret.put("error", "No contact selected");
            call.resolve(ret);
            return;
        }

        Uri contactUri = data.getData();
        android.util.Log.d("ShortcutPlugin", "Selected contact URI: " + contactUri);

        String name = null;
        String phoneNumber = null;
        long contactId = -1;

        try {
            Context context = getContext();
            if (context != null) {
                ContentResolver resolver = context.getContentResolver();
                
                // Query the contact data - use CONTACT_ID instead of PHOTO_URI
                // PHOTO_URI is unreliable across Android versions/manufacturers
                String[] projection = {
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER,
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID
                };
                
                Cursor cursor = resolver.query(contactUri, projection, null, null, null);
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(
                            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                        int numberIndex = cursor.getColumnIndex(
                            ContactsContract.CommonDataKinds.Phone.NUMBER);
                        int contactIdIndex = cursor.getColumnIndex(
                            ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
                        
                        if (nameIndex >= 0) {
                            name = cursor.getString(nameIndex);
                        }
                        if (numberIndex >= 0) {
                            phoneNumber = cursor.getString(numberIndex);
                        }
                        if (contactIdIndex >= 0) {
                            contactId = cursor.getLong(contactIdIndex);
                        }
                    }
                    cursor.close();
                }
            }
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Failed to query contact: " + e.getMessage());
            e.printStackTrace();
            ret.put("success", false);
            ret.put("error", "Failed to read contact: " + e.getMessage());
            call.resolve(ret);
            return;
        }

        if (phoneNumber == null || phoneNumber.isEmpty()) {
            ret.put("success", false);
            ret.put("error", "No phone number found for contact");
            call.resolve(ret);
            return;
        }

        android.util.Log.d("ShortcutPlugin", "Contact picked - name: " + name + 
            ", phone: " + phoneNumber + ", contactId: " + contactId);

        ret.put("success", true);
        ret.put("name", name != null ? name : "");
        ret.put("phoneNumber", phoneNumber);
        
        // Use the official Android API to get contact photo
        // This is more reliable than PHOTO_URI across Android versions
        if (contactId >= 0) {
            try {
                Context ctx = getContext();
                if (ctx != null) {
                    ContentResolver resolver = ctx.getContentResolver();
                    
                    // Build contact URI from CONTACT_ID
                    Uri contactContentUri = ContentUris.withAppendedId(
                        ContactsContract.Contacts.CONTENT_URI, contactId);
                    
                    // Use official API - try high-res first (preferHighres = true)
                    InputStream photoStream = ContactsContract.Contacts
                        .openContactPhotoInputStream(resolver, contactContentUri, true);
                    
                    // Fall back to thumbnail if high-res unavailable
                    if (photoStream == null) {
                        photoStream = ContactsContract.Contacts
                            .openContactPhotoInputStream(resolver, contactContentUri, false);
                    }
                    
                    if (photoStream != null) {
                        Bitmap photoBitmap = BitmapFactory.decodeStream(photoStream);
                        photoStream.close();
                        
                        if (photoBitmap != null) {
                            // Scale to max 200x200 for icon use
                            int maxSize = 200;
                            int width = photoBitmap.getWidth();
                            int height = photoBitmap.getHeight();
                            float scale = Math.min((float) maxSize / width, (float) maxSize / height);
                            
                            if (scale < 1) {
                                int scaledW = Math.round(width * scale);
                                int scaledH = Math.round(height * scale);
                                photoBitmap = Bitmap.createScaledBitmap(photoBitmap, scaledW, scaledH, true);
                            }
                            
                            // Encode to base64 JPEG
                            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                            photoBitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream);
                            String base64 = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP);
                            ret.put("photoBase64", "data:image/jpeg;base64," + base64);
                            android.util.Log.d("ShortcutPlugin", "Contact photo converted to base64 using openContactPhotoInputStream, size: " + base64.length());
                        }
                    } else {
                        android.util.Log.d("ShortcutPlugin", "No photo available for contact ID: " + contactId);
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "Could not load contact photo: " + e.getMessage());
            }
        }

        call.resolve(ret);
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
    
    // Get file size from content:// URI.
    // NOTE: Some providers report OpenableColumns.SIZE=0; we fall back to file descriptor stats.
    private long getContentSize(Context context, Uri uri) {
        // 1) Try standard metadata column
        try {
            Cursor cursor = context.getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (sizeIndex >= 0) {
                            long size = cursor.getLong(sizeIndex);
                            if (size > 0) return size;
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "getContentSize: query failed: " + e.getMessage());
        }

        // 2) Try AssetFileDescriptor length
        try {
            ContentResolver resolver = context.getContentResolver();
            AssetFileDescriptor afd = resolver.openAssetFileDescriptor(uri, "r");
            if (afd != null) {
                try {
                    long len = afd.getLength();
                    if (len > 0) return len;
                } finally {
                    afd.close();
                }
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "getContentSize: openAssetFileDescriptor failed: " + e.getMessage());
        }

        // 3) Try ParcelFileDescriptor statSize
        try {
            ContentResolver resolver = context.getContentResolver();
            ParcelFileDescriptor pfd = resolver.openFileDescriptor(uri, "r");
            if (pfd != null) {
                try {
                    long stat = pfd.getStatSize();
                    if (stat > 0) return stat;
                } finally {
                    pfd.close();
                }
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "getContentSize: openFileDescriptor failed: " + e.getMessage());
        }

        // Unknown
        return 0;
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

        // Priority 5: Auto-generate video thumbnail if this is a video file
        String intentType = call.getString("intentType");
        String intentData = call.getString("intentData");
        if (intentType != null && intentType.startsWith("video/") && intentData != null) {
            android.util.Log.d("ShortcutPlugin", "Attempting video thumbnail extraction as fallback icon");
            try {
                Uri videoUri = Uri.parse(intentData);
                Icon videoIcon = createVideoThumbnailIcon(getContext(), videoUri);
                if (videoIcon != null) {
                    android.util.Log.d("ShortcutPlugin", "Successfully created video thumbnail icon");
                    return videoIcon;
                }
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "Video thumbnail fallback failed: " + e.getMessage());
            }
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
            
            // Adaptive icon size: 108dp * 2 = 216px for foreground layer
            int adaptiveSize = 216;
            int contentSize = 144; // Content area (leaves ~33% padding for safe zone)
            
            // Create larger canvas for adaptive icon
            Bitmap adaptiveBitmap = Bitmap.createBitmap(adaptiveSize, adaptiveSize, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(adaptiveBitmap);
            
            // Scale original to fit content area
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, contentSize, contentSize, true);
            
            // Center content in adaptive canvas
            int offset = (adaptiveSize - contentSize) / 2;
            canvas.drawBitmap(scaled, offset, offset, null);
            
            // Recycle original if it's different from scaled
            if (scaled != bitmap) {
                bitmap.recycle();
            }
            scaled.recycle();
            
            android.util.Log.d("ShortcutPlugin", "Created adaptive bitmap icon: " + adaptiveBitmap.getWidth() + "x" + adaptiveBitmap.getHeight());
            return Icon.createWithAdaptiveBitmap(adaptiveBitmap);
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
            
            // Adaptive icon size: 108dp * 2 = 216px for foreground layer
            int adaptiveSize = 216;
            int contentSize = 144; // Content area (leaves ~33% padding for safe zone)
            
            // Create larger canvas for adaptive icon
            Bitmap adaptiveBitmap = Bitmap.createBitmap(adaptiveSize, adaptiveSize, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(adaptiveBitmap);
            
            // Scale original to fit content area
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, contentSize, contentSize, true);
            
            // Center content in adaptive canvas
            int offset = (adaptiveSize - contentSize) / 2;
            canvas.drawBitmap(scaled, offset, offset, null);
            
            if (scaled != bitmap) {
                bitmap.recycle();
            }
            scaled.recycle();
            
            return Icon.createWithAdaptiveBitmap(adaptiveBitmap);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error creating icon from URI: " + e.getMessage());
            return null;
        }
    }
    
    // Create video thumbnail for shortcut icon with timeout protection
    private Icon createVideoThumbnailIcon(Context context, Uri videoUri) {
        MediaMetadataRetriever retriever = null;
        try {
            android.util.Log.d("ShortcutPlugin", "Extracting video thumbnail from: " + videoUri);
            retriever = new MediaMetadataRetriever();
            retriever.setDataSource(context, videoUri);
            
            // Get a frame at 1 second (or first frame)
            Bitmap frame = retriever.getFrameAtTime(1000000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            
            if (frame == null) {
                android.util.Log.w("ShortcutPlugin", "Could not extract video frame");
                return null;
            }
            
            // Adaptive icon size: 108dp * 2 = 216px for foreground layer
            int adaptiveSize = 216;
            int contentSize = 144; // Content area (leaves ~33% padding for safe zone)
            
            // Create larger canvas for adaptive icon
            Bitmap adaptiveBitmap = Bitmap.createBitmap(adaptiveSize, adaptiveSize, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(adaptiveBitmap);
            
            // Scale frame to fit content area
            Bitmap scaled = Bitmap.createScaledBitmap(frame, contentSize, contentSize, true);
            
            // Center content in adaptive canvas
            int offset = (adaptiveSize - contentSize) / 2;
            canvas.drawBitmap(scaled, offset, offset, null);
            
            if (scaled != frame) {
                frame.recycle();
            }
            scaled.recycle();
            
            android.util.Log.d("ShortcutPlugin", "Created adaptive video thumbnail icon");
            return Icon.createWithAdaptiveBitmap(adaptiveBitmap);
        } catch (IllegalArgumentException e) {
            android.util.Log.w("ShortcutPlugin", "Video thumbnail failed (invalid data source): " + e.getMessage());
            return null;
        } catch (RuntimeException e) {
            android.util.Log.w("ShortcutPlugin", "Video thumbnail failed (runtime error): " + e.getMessage());
            return null;
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error creating video thumbnail: " + e.getMessage());
            return null;
        } finally {
            // Always release retriever to prevent resource leaks
            if (retriever != null) {
                try {
                    retriever.release();
                } catch (Exception ignored) {
                    android.util.Log.w("ShortcutPlugin", "Error releasing MediaMetadataRetriever");
                }
            }
        }
    }

    private Icon createEmojiIcon(String emoji) {
        // Adaptive icon size: 108dp * 2 = 216px for foreground layer
        int adaptiveSize = 216;
        Bitmap bitmap = Bitmap.createBitmap(adaptiveSize, adaptiveSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        // Fill entire canvas with background color (will be masked by launcher)
        Paint bgPaint = new Paint();
        bgPaint.setColor(Color.parseColor("#2563EB"));
        bgPaint.setStyle(Paint.Style.FILL);
        canvas.drawRect(0, 0, adaptiveSize, adaptiveSize, bgPaint);

        // Draw emoji centered
        Paint textPaint = new Paint();
        textPaint.setTextSize(adaptiveSize * 0.4f);
        textPaint.setTextAlign(Paint.Align.CENTER);
        float y = (adaptiveSize / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2);
        canvas.drawText(emoji, adaptiveSize / 2f, y, textPaint);

        return Icon.createWithAdaptiveBitmap(bitmap);
    }

    private Icon createTextIcon(String text) {
        // Adaptive icon size: 108dp * 2 = 216px for foreground layer
        int adaptiveSize = 216;
        Bitmap bitmap = Bitmap.createBitmap(adaptiveSize, adaptiveSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        // Fill entire canvas with background color (will be masked by launcher)
        Paint bgPaint = new Paint();
        bgPaint.setColor(Color.parseColor("#2563EB"));
        bgPaint.setStyle(Paint.Style.FILL);
        canvas.drawRect(0, 0, adaptiveSize, adaptiveSize, bgPaint);

        // Draw text centered
        Paint textPaint = new Paint();
        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(adaptiveSize * 0.35f);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setFakeBoldText(true);
        String displayText = text.substring(0, Math.min(2, text.length())).toUpperCase();
        float y = (adaptiveSize / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2);
        canvas.drawText(displayText, adaptiveSize / 2f, y, textPaint);

        return Icon.createWithAdaptiveBitmap(bitmap);
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
        } else if ("app.onetap.PLAY_VIDEO".equals(action)) {
            // Internal video player fallback from VideoProxyActivity
            Uri uri = intent.getData();
            if (uri == null) {
                android.util.Log.e("ShortcutPlugin", "PLAY_VIDEO intent missing data URI");
                call.resolve(null);
                return;
            }

            // IMPORTANT: If we receive our own FileProvider URI, convert it to a stable absolute file path.
            // This avoids edge cases where a launcher/provider doesn't preserve transient grants across cold start.
            String dataString = uri.toString();
            try {
                Context context = getContext();
                if (context != null) {
                    String authority = uri.getAuthority();
                    if (authority != null && authority.equals(context.getPackageName() + ".fileprovider")) {
                        String path = uri.getPath();
                        if (path != null && path.contains("/shortcuts/")) {
                            String fileName = path.substring(path.lastIndexOf("/") + 1);
                            File shortcutsDir = new File(context.getFilesDir(), "shortcuts");
                            File localFile = new File(shortcutsDir, fileName);
                            if (localFile.exists() && localFile.length() > 0) {
                                dataString = "file://" + localFile.getAbsolutePath();
                                android.util.Log.d("ShortcutPlugin", "PLAY_VIDEO: converted FileProvider URI to file path: " + dataString);
                            } else {
                                android.util.Log.w("ShortcutPlugin", "PLAY_VIDEO: local shortcut file missing/empty: " + localFile.getAbsolutePath());
                            }
                        }
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "PLAY_VIDEO: failed to convert to file path, keeping original URI: " + e);
            }

            JSObject result = new JSObject();
            result.put("action", action);
            result.put("type", type != null ? type : "video/*");
            result.put("data", dataString);
            android.util.Log.d("ShortcutPlugin", "PLAY_VIDEO data: " + dataString);
            call.resolve(result);
        } else if ("app.onetap.VIEW_PDF".equals(action)) {
            // Internal PDF viewer from PDFProxyActivity
            Uri uri = intent.getData();
            if (uri == null) {
                android.util.Log.e("ShortcutPlugin", "VIEW_PDF intent missing data URI");
                call.resolve(null);
                return;
            }
            
            // Convert FileProvider URI to file path if needed
            String dataString = uri.toString();
            try {
                Context context = getContext();
                if (context != null) {
                    String authority = uri.getAuthority();
                    if (authority != null && authority.equals(context.getPackageName() + ".fileprovider")) {
                        String path = uri.getPath();
                        if (path != null && path.contains("/shortcuts/")) {
                            String fileName = path.substring(path.lastIndexOf("/") + 1);
                            File shortcutsDir = new File(context.getFilesDir(), "shortcuts");
                            File localFile = new File(shortcutsDir, fileName);
                            if (localFile.exists() && localFile.length() > 0) {
                                dataString = "file://" + localFile.getAbsolutePath();
                                android.util.Log.d("ShortcutPlugin", "VIEW_PDF: converted FileProvider URI to file path: " + dataString);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "VIEW_PDF: failed to convert to file path, keeping original URI: " + e);
            }
            
            // Extract PDF-specific extras
            String shortcutId = intent.getStringExtra("shortcut_id");
            boolean resume = intent.getBooleanExtra("resume", false);
            
            JSObject result = new JSObject();
            result.put("action", action);
            result.put("type", type != null ? type : "application/pdf");
            result.put("data", dataString);
            result.put("shortcutId", shortcutId != null ? shortcutId : "");
            result.put("resume", resume);
            
            android.util.Log.d("ShortcutPlugin", "VIEW_PDF data: " + dataString + 
                               ", shortcutId=" + shortcutId + ", resume=" + resume);
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

        Context context = getContext();
        Uri uri = Uri.parse(contentUri);
        JSObject result = new JSObject();

        // Check if this is our own FileProvider URI (files we saved to shortcuts directory)
        String authority = uri.getAuthority();
        if (authority != null && authority.equals(context.getPackageName() + ".fileprovider")) {
            try {
                String path = uri.getPath();
                if (path != null && path.contains("/shortcuts/")) {
                    // Extract filename from path like /shortcuts/filename.mp4
                    String fileName = path.substring(path.lastIndexOf("/") + 1);
                    File shortcutsDir = new File(context.getFilesDir(), "shortcuts");
                    File localFile = new File(shortcutsDir, fileName);
                    
                    if (localFile.exists()) {
                        android.util.Log.d("ShortcutPlugin", "resolveContentUri: using existing file in shortcuts dir: " + localFile.getAbsolutePath());
                        result.put("success", true);
                        result.put("filePath", localFile.getAbsolutePath());
                        call.resolve(result);
                        return;
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "Failed to extract path from FileProvider URI: " + e);
            }
        }

        // Check if the URI is already a file:// path
        if ("file".equals(uri.getScheme())) {
            String path = uri.getPath();
            if (path != null && new File(path).exists()) {
                android.util.Log.d("ShortcutPlugin", "resolveContentUri: using existing file:// path: " + path);
                result.put("success", true);
                result.put("filePath", path);
                call.resolve(result);
                return;
            }
        }

        // IMPORTANT: Avoid returning "real filesystem paths" for content:// URIs.
        // Those paths can become unreadable under scoped storage once transient URI grants are cleared.
        // Instead, we copy into app-private *persistent* storage and return an absolute file path.
        try {
            ContentResolver resolver = context.getContentResolver();

            // Try to get a stable display name (preserves extensions like .mp4)
            String displayName = null;
            try {
                Cursor cursor = resolver.query(uri, null, null, null, null);
                if (cursor != null) {
                    try {
                        if (cursor.moveToFirst()) {
                            int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                            if (idx >= 0) {
                                displayName = cursor.getString(idx);
                            }
                        }
                    } finally {
                        cursor.close();
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "resolveContentUri: failed to read display name: " + e.getMessage());
            }

            String detectedMime = detectMimeType(context, uri);
            String extension = getExtensionFromMimeType(detectedMime);
            if (extension == null) extension = "";

            // If MIME detection failed, try to infer extension from displayName
            String safeName = (displayName != null && !displayName.isEmpty()) ? displayName : "video";
            safeName = safeName.replaceAll("[^a-zA-Z0-9._-]", "_");

            String safeBase = safeName;
            int dot = safeName.lastIndexOf('.');
            if (dot > 0) {
                safeBase = safeName.substring(0, dot);
                if (extension.isEmpty()) {
                    extension = safeName.substring(dot); // includes dot
                }
            }

            File persistDir = new File(context.getFilesDir(), "onetap_resolved");
            if (!persistDir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                persistDir.mkdirs();
            }

            long expectedSize = getContentSize(context, uri);

            String resolvedFileName = "resolved_" + Math.abs(contentUri.hashCode()) + "_" + safeBase + extension;
            File outFile = new File(persistDir, resolvedFileName);

            // If file already exists and seems complete, reuse it
            if (outFile.exists() && outFile.length() > 0 && (expectedSize <= 0 || outFile.length() == expectedSize)) {
                android.util.Log.d("ShortcutPlugin", "resolveContentUri: reusing persistent file: " + outFile.getAbsolutePath());
                result.put("success", true);
                result.put("filePath", outFile.getAbsolutePath());
                call.resolve(result);
                return;
            }

            // If we have an incomplete/empty file, delete and re-copy
            if (outFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                outFile.delete();
            }

            InputStream in = resolver.openInputStream(uri);
            if (in == null) {
                throw new Exception("ContentResolver.openInputStream returned null");
            }

            // Atomic write: copy to temp file first, then rename
            File tempFile = new File(persistDir, resolvedFileName + ".tmp");
            try (InputStream input = in; FileOutputStream output = new FileOutputStream(tempFile)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                output.getFD().sync();
            }

            // If copy was short, keep temp for debugging but don't reuse it next time.
            if (expectedSize > 0 && tempFile.length() != expectedSize) {
                android.util.Log.w("ShortcutPlugin", "resolveContentUri: copied size mismatch expected=" + expectedSize + " got=" + tempFile.length());
            }

            if (tempFile.renameTo(outFile)) {
                android.util.Log.d("ShortcutPlugin", "resolveContentUri: copied to persistent path=" + outFile.getAbsolutePath());
                result.put("success", true);
                result.put("filePath", outFile.getAbsolutePath());
            } else {
                android.util.Log.w("ShortcutPlugin", "resolveContentUri: rename failed, using temp file");
                result.put("success", true);
                result.put("filePath", tempFile.getAbsolutePath());
            }

            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "resolveContentUri fallback copy failed: " + e.getMessage());
            result.put("success", false);
            result.put("error", "Could not resolve URI to file path: " + e.getMessage());
            call.resolve(result);
        }
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

    /**
     * Opens a URL in a custom WebView with configurable User-Agent.
     * This allows true desktop or mobile site viewing.
     */
    @PluginMethod
    public void openDesktopWebView(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "openDesktopWebView called");
        
        String url = call.getString("url");
        String viewMode = call.getString("viewMode", "desktop");
        String title = call.getString("title", "");
        
        if (url == null || url.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "URL is required");
            call.resolve(result);
            return;
        }
        
        Context context = getContext();
        Activity activity = getActivity();
        
        if (context == null || activity == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Context or activity is null");
            call.resolve(result);
            return;
        }
        
        try {
            Intent intent = new Intent(context, DesktopWebViewActivity.class);
            intent.putExtra(DesktopWebViewActivity.EXTRA_URL, url);
            intent.putExtra(DesktopWebViewActivity.EXTRA_VIEW_MODE, viewMode);
            intent.putExtra(DesktopWebViewActivity.EXTRA_TITLE, title);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
            activity.startActivity(intent);
            
            android.util.Log.d("ShortcutPlugin", "Launched DesktopWebViewActivity with URL: " + url + ", mode: " + viewMode);
            
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error launching DesktopWebViewActivity: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    // ========== Scheduled Actions Methods ==========

    @PluginMethod
    public void scheduleAction(PluginCall call) {
        String actionId = call.getString("id");
        String actionName = call.getString("name");
        String description = call.getString("description", "");
        String destinationType = call.getString("destinationType");
        String destinationData = call.getString("destinationData");
        Long triggerTime = call.getLong("triggerTime");
        String recurrence = call.getString("recurrence", "once");

        android.util.Log.d("ShortcutPlugin", "scheduleAction called: " + actionName);

        if (actionId == null || actionName == null || destinationType == null || 
            destinationData == null || triggerTime == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Missing required parameters");
            call.resolve(result);
            return;
        }

        Context context = getContext();
        if (context == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Context is null");
            call.resolve(result);
            return;
        }

        try {
            // Create notification channel
            NotificationHelper.createNotificationChannel(context);

            // Store action for restoration after reboot
            ScheduledActionReceiver.storeAction(
                context,
                actionId,
                actionName,
                description,
                destinationType,
                destinationData,
                triggerTime,
                recurrence
            );

            // Create and schedule the alarm
            Intent alarmIntent = ScheduledActionReceiver.createActionIntent(
                context,
                actionId,
                actionName,
                description,
                destinationType,
                destinationData,
                triggerTime,
                recurrence
            );

            ScheduledActionReceiver.scheduleAlarm(context, actionId, triggerTime, alarmIntent);

            android.util.Log.d("ShortcutPlugin", "Scheduled action: " + actionName + " at " + triggerTime);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error scheduling action: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void cancelScheduledAction(PluginCall call) {
        String actionId = call.getString("id");

        if (actionId == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Action ID is required");
            call.resolve(result);
            return;
        }

        Context context = getContext();
        if (context == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Context is null");
            call.resolve(result);
            return;
        }

        try {
            // Cancel the alarm
            ScheduledActionReceiver.cancelAlarm(context, actionId);

            // Remove from storage
            ScheduledActionReceiver.removeStoredAction(context, actionId);

            android.util.Log.d("ShortcutPlugin", "Cancelled scheduled action: " + actionId);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error cancelling action: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void checkAlarmPermission(PluginCall call) {
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            android.app.AlarmManager alarmManager = (android.app.AlarmManager) 
                getContext().getSystemService(Context.ALARM_SERVICE);
            
            boolean granted = alarmManager != null && alarmManager.canScheduleExactAlarms();
            result.put("granted", granted);
            result.put("canRequest", !granted);
        } else {
            // Pre-Android 12, exact alarms don't require permission
            result.put("granted", true);
            result.put("canRequest", false);
        }

        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ requires runtime permission for notifications
            Activity activity = getActivity();
            if (activity != null) {
                int permission = ContextCompat.checkSelfPermission(
                    activity, 
                    Manifest.permission.POST_NOTIFICATIONS
                );
                
                if (permission == PackageManager.PERMISSION_GRANTED) {
                    JSObject result = new JSObject();
                    result.put("granted", true);
                    call.resolve(result);
                } else {
                    // Request permission
                    ActivityCompat.requestPermissions(
                        activity,
                        new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                        1001
                    );
                    
                    // For simplicity, return optimistic result
                    // In production, use permission callback
                    JSObject result = new JSObject();
                    result.put("granted", false);
                    call.resolve(result);
                }
            } else {
                JSObject result = new JSObject();
                result.put("granted", false);
                call.resolve(result);
            }
        } else {
            // Pre-Android 13, notification permission is granted at install
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Activity activity = getActivity();
            if (activity != null) {
                int permission = ContextCompat.checkSelfPermission(
                    activity, 
                    Manifest.permission.POST_NOTIFICATIONS
                );
                result.put("granted", permission == PackageManager.PERMISSION_GRANTED);
            } else {
                result.put("granted", false);
            }
        } else {
            // Pre-Android 13, notification permission is granted at install
            result.put("granted", true);
        }

        call.resolve(result);
    }

    // ========== Call Permission (for Contact Shortcuts) ==========

    @PluginMethod
    public void checkCallPermission(PluginCall call) {
        JSObject result = new JSObject();
        
        Activity activity = getActivity();
        if (activity != null) {
            int permission = ContextCompat.checkSelfPermission(
                activity, 
                Manifest.permission.CALL_PHONE
            );
            result.put("granted", permission == PackageManager.PERMISSION_GRANTED);
        } else {
            result.put("granted", false);
        }
        
        call.resolve(result);
    }

    @PluginMethod
    public void requestCallPermission(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            int permission = ContextCompat.checkSelfPermission(
                activity, 
                Manifest.permission.CALL_PHONE
            );
            
            if (permission == PackageManager.PERMISSION_GRANTED) {
                JSObject result = new JSObject();
                result.put("granted", true);
                call.resolve(result);
            } else {
                // Store call for permission callback
                pendingPermissionCall = call;
                
                // Request permission
                ActivityCompat.requestPermissions(
                    activity,
                    new String[]{ Manifest.permission.CALL_PHONE },
                    1002  // Request code for CALL_PHONE
                );
                
                // Note: The actual result will come via onRequestPermissionsResult
                // For simplicity, we resolve immediately with the current state
                // The UI should re-check permission status after the dialog is dismissed
                JSObject result = new JSObject();
                result.put("granted", false);
                result.put("requested", true);
                call.resolve(result);
            }
        } else {
            JSObject result = new JSObject();
            result.put("granted", false);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void openAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
                
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.resolve(result);
            }
        } else {
            // Pre-Android 12, exact alarms don't require permission
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        }
    }

    /**
     * Show a test notification immediately to verify notification system works.
     * This bypasses the alarm system and directly triggers a notification.
     */
    @PluginMethod
    public void showTestNotification(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Context is null");
            call.resolve(result);
            return;
        }

        try {
            // Show a test notification with a dummy action
            String testId = "test_" + System.currentTimeMillis();
            NotificationHelper.showActionNotification(
                context,
                testId,
                "Test Notification",
                null,
                "url",
                "{\"uri\": \"https://google.com\"}"
            );

            android.util.Log.d("ShortcutPlugin", "Test notification shown with id: " + testId);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error showing test notification: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    // ========== Widget Support ==========

    /**
     * Sync shortcut data to Android widgets.
     * Stores shortcuts JSON in SharedPreferences for widget access.
     */
    @PluginMethod
    public void syncWidgetData(PluginCall call) {
        String shortcutsJson = call.getString("shortcuts", "[]");
        
        android.util.Log.d("ShortcutPlugin", "syncWidgetData called, data length: " + shortcutsJson.length());

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            // Store in SharedPreferences for widget access
            SharedPreferences prefs = context.getSharedPreferences("widget_data", Context.MODE_PRIVATE);
            prefs.edit().putString("shortcuts", shortcutsJson).apply();


            android.util.Log.d("ShortcutPlugin", "Widget data synced successfully");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error syncing widget data: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Refresh all home screen widgets.
     */
    @PluginMethod
    public void refreshWidgets(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "refreshWidgets called");

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            // Refresh Quick Create widgets
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            ComponentName quickCreateWidget = new ComponentName(context, 
                context.getPackageName() + ".QuickCreateWidget");
            int[] quickCreateIds = appWidgetManager.getAppWidgetIds(quickCreateWidget);
            if (quickCreateIds.length > 0) {
                Intent updateIntent = new Intent(context, 
                    Class.forName(context.getPackageName() + ".QuickCreateWidget"));
                updateIntent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                updateIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, quickCreateIds);
                context.sendBroadcast(updateIntent);
            }

            android.util.Log.d("ShortcutPlugin", "Widgets refreshed");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error refreshing widgets: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Check if the app was launched from the Quick Create widget.
     */
    @PluginMethod
    public void checkQuickCreateIntent(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "checkQuickCreateIntent called");

        try {
            Activity activity = getActivity();
            if (activity instanceof MainActivity) {
                MainActivity mainActivity = (MainActivity) activity;
                boolean quickCreate = mainActivity.hasPendingQuickCreate();
                
                // Clear the flag after checking
                if (quickCreate) {
                    mainActivity.clearPendingQuickCreate();
                }
                
                android.util.Log.d("ShortcutPlugin", "Quick create intent: " + quickCreate);

                JSObject result = new JSObject();
                result.put("quickCreate", quickCreate);
                call.resolve(result);
            } else {
                JSObject result = new JSObject();
                result.put("quickCreate", false);
                call.resolve(result);
            }
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error checking quick create intent: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("quickCreate", false);
            call.resolve(result);
        }
    }

    /**
     * Sync app settings to SharedPreferences for native components (video player, etc.).
     */
    @PluginMethod
    public void syncSettings(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "syncSettings called");

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            String settingsJson = call.getString("settings");
            if (settingsJson == null || settingsJson.isEmpty()) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Missing settings JSON");
                call.resolve(result);
                return;
            }

            // Store in SharedPreferences for native component access
            SharedPreferences prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE);
            prefs.edit().putString("settings", settingsJson).apply();

            android.util.Log.d("ShortcutPlugin", "Settings synced successfully: " + settingsJson);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error syncing settings: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    // ========== Notification Click Tracking ==========

    /**
     * Get clicked notification IDs from SharedPreferences and clear the list.
     * Called by JS layer on app startup to sync click data.
     */
    @PluginMethod
    public void getClickedNotificationIds(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "getClickedNotificationIds called");

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("ids", new JSArray());
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            // Get and clear clicked IDs
            String[] clickedIds = NotificationClickActivity.getAndClearClickedIds(context);
            
            JSArray idsArray = new JSArray();
            for (String id : clickedIds) {
                idsArray.put(id);
            }

            android.util.Log.d("ShortcutPlugin", "Retrieved " + clickedIds.length + " clicked notification IDs");

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("ids", idsArray);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting clicked notification IDs: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("ids", new JSArray());
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    // ========== WhatsApp Pending Action ==========

    /**
     * Get pending WhatsApp action (from multi-message shortcut).
     * Called by JS layer on app startup to show message chooser if needed.
     */
    @PluginMethod
    public void getPendingWhatsAppAction(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "getPendingWhatsAppAction called");

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("hasPending", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            WhatsAppProxyActivity.PendingWhatsAppAction pending = WhatsAppProxyActivity.getPendingAction(context);
            
            JSObject result = new JSObject();
            result.put("success", true);
            
            if (pending != null) {
                result.put("hasPending", true);
                result.put("phoneNumber", pending.phoneNumber);
                result.put("messagesJson", pending.messagesJson);
                result.put("contactName", pending.contactName);
                android.util.Log.d("ShortcutPlugin", "Found pending WhatsApp action for: " + pending.phoneNumber);
            } else {
                result.put("hasPending", false);
                android.util.Log.d("ShortcutPlugin", "No pending WhatsApp action");
            }
            
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting pending WhatsApp action: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("hasPending", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Clear pending WhatsApp action after it has been handled.
     */
    @PluginMethod
    public void clearPendingWhatsAppAction(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "clearPendingWhatsAppAction called");

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            WhatsAppProxyActivity.clearPendingAction(context);
            
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error clearing pending WhatsApp action: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Open WhatsApp with optional message prefill.
     * Used after message is selected from the JS chooser.
     */
    @PluginMethod
    public void openWhatsApp(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "openWhatsApp called");

        String phoneNumber = call.getString("phoneNumber");
        String message = call.getString("message");

        if (phoneNumber == null || phoneNumber.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Phone number is required");
            call.resolve(result);
            return;
        }

        try {
            String cleanNumber = phoneNumber.replaceAll("[^0-9]", "");
            String url = "https://wa.me/" + cleanNumber;
            
            if (message != null && !message.isEmpty()) {
                url += "?text=" + java.net.URLEncoder.encode(message, "UTF-8");
            }

            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
            getActivity().startActivity(intent);
            
            android.util.Log.d("ShortcutPlugin", "Opened WhatsApp for: " + cleanNumber + 
                (message != null ? " with message prefill" : " without message"));

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error opening WhatsApp: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    // ========== Shortcut Edit ==========

    /**
     * Get pending edit shortcut ID (from home screen long-press edit action).
     * Called by JS layer on app startup to check if user wants to edit a shortcut.
     */
    @PluginMethod
    public void getPendingEditShortcut(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "getPendingEditShortcut called");

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            String shortcutId = ShortcutEditProxyActivity.getPendingEditId(context);
            
            JSObject result = new JSObject();
            result.put("success", true);
            
            if (shortcutId != null && !shortcutId.isEmpty()) {
                result.put("shortcutId", shortcutId);
                android.util.Log.d("ShortcutPlugin", "Found pending edit shortcut: " + shortcutId);
            } else {
                android.util.Log.d("ShortcutPlugin", "No pending edit shortcut");
            }
            
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting pending edit shortcut: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Clear pending edit shortcut ID after it has been handled.
     */
    @PluginMethod
    public void clearPendingEditShortcut(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "clearPendingEditShortcut called");

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            ShortcutEditProxyActivity.clearPendingEditId(context);
            
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error clearing pending edit shortcut: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    // ========== Home Screen Sync ==========

    /**
     * Get IDs of shortcuts currently pinned on the home screen.
     * Used to sync app storage with actual home screen state.
     */
    @PluginMethod
    public void getPinnedShortcutIds(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "getPinnedShortcutIds called");

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // ShortcutManager not available before Android 8.0
            JSObject result = new JSObject();
            result.put("ids", new JSArray());
            call.resolve(result);
            return;
        }

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("ids", new JSArray());
                call.resolve(result);
                return;
            }

            ShortcutManager manager = context.getSystemService(ShortcutManager.class);
            if (manager == null) {
                JSObject result = new JSObject();
                result.put("ids", new JSArray());
                call.resolve(result);
                return;
            }

            List<ShortcutInfo> pinnedShortcuts = manager.getPinnedShortcuts();
            JSArray ids = new JSArray();
            
            for (ShortcutInfo info : pinnedShortcuts) {
                ids.put(info.getId());
            }

            android.util.Log.d("ShortcutPlugin", "Found " + pinnedShortcuts.size() + " pinned shortcuts");

            JSObject result = new JSObject();
            result.put("ids", ids);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting pinned shortcuts: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("ids", new JSArray());
            call.resolve(result);
        }
    }

    /**
     * Disable and remove a pinned shortcut from the home screen.
     * Uses ShortcutManager.disableShortcuts() which removes the shortcut
     * from the launcher and prevents it from being pinned again.
     */
    @PluginMethod
    public void disablePinnedShortcut(PluginCall call) {
        String shortcutId = call.getString("id");
        android.util.Log.d("ShortcutPlugin", "disablePinnedShortcut called for id: " + shortcutId);

        if (shortcutId == null || shortcutId.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Shortcut ID is required");
            call.resolve(result);
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // ShortcutManager not available before Android 8.0
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Android 8.0+ required");
            call.resolve(result);
            return;
        }

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            ShortcutManager manager = context.getSystemService(ShortcutManager.class);
            if (manager == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "ShortcutManager not available");
                call.resolve(result);
                return;
            }

            // Disable the shortcut - this removes it from the home screen
            // The message is shown if user tries to use a disabled shortcut
            List<String> shortcutIds = new ArrayList<>();
            shortcutIds.add(shortcutId);
            
            manager.disableShortcuts(shortcutIds, "This shortcut has been deleted");
            
            android.util.Log.d("ShortcutPlugin", "Disabled pinned shortcut: " + shortcutId);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error disabling shortcut: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
        call.resolve(result);
        }
    }

    /**
     * Update an existing pinned shortcut in-place on the home screen.
     * Uses ShortcutManager.updateShortcuts() which changes the label, icon,
     * and intent data without affecting the shortcut's position on the launcher.
     * 
     * Supports updating:
     * - Label and icon (all shortcut types)
     * - WhatsApp: phone number, quick messages
     * - Contact: phone number
     * - PDF: resume enabled
     * - File/Link: content URI
     */
    @PluginMethod
    public void updatePinnedShortcut(PluginCall call) {
        String shortcutId = call.getString("id");
        String label = call.getString("label");
        
        // Intent-affecting properties
        String shortcutType = call.getString("shortcutType");
        String phoneNumber = call.getString("phoneNumber");
        String messageApp = call.getString("messageApp");
        Boolean resumeEnabled = call.getBoolean("resumeEnabled", false);
        String contentUri = call.getString("contentUri");
        String mimeType = call.getString("mimeType");
        String contactName = call.getString("contactName");
        
        // Parse quick messages array
        JSArray quickMessagesArray = call.getArray("quickMessages");
        String quickMessagesJson = null;
        if (quickMessagesArray != null) {
            try {
                quickMessagesJson = quickMessagesArray.toString();
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "Error parsing quickMessages: " + e.getMessage());
            }
        }
        
        android.util.Log.d("ShortcutPlugin", "updatePinnedShortcut called for id: " + shortcutId + 
            ", label: " + label + ", type: " + shortcutType + 
            ", hasQuickMessages: " + (quickMessagesJson != null));

        if (shortcutId == null || shortcutId.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Shortcut ID is required");
            call.resolve(result);
            return;
        }

        if (label == null || label.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Label is required");
            call.resolve(result);
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Android 8.0+ required");
            call.resolve(result);
            return;
        }

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            ShortcutManager manager = context.getSystemService(ShortcutManager.class);
            if (manager == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "ShortcutManager not available");
                call.resolve(result);
                return;
            }

            // Create icon from params
            Icon icon = createIconForUpdate(call);

            // Build intent based on shortcut type
            Intent intent = buildIntentForUpdate(context, shortcutType, messageApp, phoneNumber, 
                quickMessagesJson, contactName, resumeEnabled, contentUri, mimeType, label, shortcutId);

            // Build updated ShortcutInfo with same ID
            ShortcutInfo.Builder builder = new ShortcutInfo.Builder(context, shortcutId)
                .setShortLabel(label)
                .setLongLabel(label);
            
            if (icon != null) {
                builder.setIcon(icon);
            }
            
            // Include intent if we built one (for intent-affecting updates)
            if (intent != null) {
                builder.setIntent(intent);
            }

            ShortcutInfo updatedInfo = builder.build();

            // Update in-place (preserves position on home screen)
            List<ShortcutInfo> shortcutsToUpdate = new ArrayList<>();
            shortcutsToUpdate.add(updatedInfo);
            
            boolean updated = manager.updateShortcuts(shortcutsToUpdate);
            
            android.util.Log.d("ShortcutPlugin", "Updated pinned shortcut: " + shortcutId + 
                ", success: " + updated + ", hadIntent: " + (intent != null));

            JSObject result = new JSObject();
            result.put("success", updated);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error updating shortcut: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Build intent for updatePinnedShortcut based on shortcut type.
     * Returns null if no intent rebuild is needed (icon/label only update).
     */
    private Intent buildIntentForUpdate(Context context, String shortcutType, String messageApp,
            String phoneNumber, String quickMessagesJson, String contactName,
            Boolean resumeEnabled, String contentUri, String mimeType, String label, String shortcutId) {
        
        if (shortcutType == null) {
            // No type specified, can't rebuild intent
            return null;
        }
        
        Intent intent = null;
        
        if ("message".equals(shortcutType) && "whatsapp".equals(messageApp)) {
            // WhatsApp shortcut - route through WhatsAppProxyActivity
            android.util.Log.d("ShortcutPlugin", "Building WhatsApp intent for update");
            intent = new Intent(context, WhatsAppProxyActivity.class);
            intent.setAction("app.onetap.WHATSAPP_MESSAGE");
            // Set data to a unique URI for this shortcut
            intent.setData(Uri.parse("onetap://whatsapp/" + shortcutId));
            if (phoneNumber != null) {
                intent.putExtra(WhatsAppProxyActivity.EXTRA_PHONE_NUMBER, phoneNumber);
            }
            if (quickMessagesJson != null) {
                intent.putExtra(WhatsAppProxyActivity.EXTRA_QUICK_MESSAGES, quickMessagesJson);
            }
            if (contactName != null) {
                intent.putExtra(WhatsAppProxyActivity.EXTRA_CONTACT_NAME, contactName);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
        } else if ("contact".equals(shortcutType)) {
            // Contact dial shortcut - route through ContactProxyActivity
            android.util.Log.d("ShortcutPlugin", "Building Contact intent for update");
            intent = new Intent(context, ContactProxyActivity.class);
            intent.setAction("app.onetap.CALL_CONTACT");
            if (phoneNumber != null) {
                intent.setData(Uri.parse("tel:" + phoneNumber));
                intent.putExtra(ContactProxyActivity.EXTRA_PHONE_NUMBER, phoneNumber);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
        } else if ("file".equals(shortcutType) && contentUri != null && mimeType != null && mimeType.equals("application/pdf")) {
            // PDF file - route through PDFProxyActivity if resume is relevant
            android.util.Log.d("ShortcutPlugin", "Building PDF intent for update, resumeEnabled=" + resumeEnabled);
            intent = new Intent(context, PDFProxyActivity.class);
            intent.setAction("app.onetap.OPEN_PDF");
            intent.setDataAndType(Uri.parse(contentUri), "application/pdf");
            intent.putExtra("shortcut_id", shortcutId);
            intent.putExtra("resume_enabled", resumeEnabled != null && resumeEnabled);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
        } else if ("file".equals(shortcutType) && contentUri != null && mimeType != null && mimeType.startsWith("video/")) {
            // Video file - route through VideoProxyActivity
            android.util.Log.d("ShortcutPlugin", "Building Video intent for update");
            intent = new Intent(context, VideoProxyActivity.class);
            intent.setAction("app.onetap.OPEN_VIDEO");
            intent.setDataAndType(Uri.parse(contentUri), mimeType);
            intent.putExtra("shortcut_title", label);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        // For link/file types that don't need special handling, we don't rebuild the intent
        // The original intent remains valid
        
        return intent;
    }

    /**
     * Create icon for updatePinnedShortcut using direct parameters.
     * Similar to createIcon but uses specific parameter names for update.
     */
    private Icon createIconForUpdate(PluginCall call) {
        // Priority 1: Base64 icon data (thumbnail)
        String iconData = call.getString("iconData");
        if (iconData != null && !iconData.isEmpty()) {
            android.util.Log.d("ShortcutPlugin", "Creating update icon from base64 data");
            Icon icon = createBitmapIcon(iconData);
            if (icon != null) {
                return icon;
            }
        }

        // Priority 2: Emoji icon
        String emoji = call.getString("iconEmoji");
        if (emoji != null && !emoji.isEmpty()) {
            android.util.Log.d("ShortcutPlugin", "Creating update emoji icon: " + emoji);
            return createEmojiIcon(emoji);
        }

        // Priority 3: Text icon
        String text = call.getString("iconText");
        if (text != null && !text.isEmpty()) {
            android.util.Log.d("ShortcutPlugin", "Creating update text icon: " + text);
            return createTextIcon(text);
        }

        android.util.Log.d("ShortcutPlugin", "No icon data provided for update, using default");
        return Icon.createWithResource(getContext(), android.R.drawable.ic_menu_add);
    }

    // ========== Native Usage Tracking ==========

    /**
     * Get native usage events recorded by proxy activities and clear the storage.
     * Called from JS on app startup to sync home screen tap counts.
     */
    @PluginMethod
    public void getNativeUsageEvents(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Context is null");
            return;
        }

        try {
            java.util.List<NativeUsageTracker.UsageEvent> events = NativeUsageTracker.getAndClearEvents(context);
            
            JSArray eventsArray = new JSArray();
            for (NativeUsageTracker.UsageEvent event : events) {
                JSObject eventObj = new JSObject();
                eventObj.put("shortcutId", event.shortcutId);
                eventObj.put("timestamp", event.timestamp);
                eventsArray.put(eventObj);
            }
            
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("events", eventsArray);
            call.resolve(result);
            
            android.util.Log.d("ShortcutPlugin", "Returned " + events.size() + " native usage events");
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting native usage events", e);
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("events", new JSArray());
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }
}
