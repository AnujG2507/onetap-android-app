package app.onetap.access.plugins;

// Android framework imports
import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.webkit.MimeTypeMap;

// AndroidX imports
import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;

// Capacitor imports
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// Java standard library
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.HttpURLConnection;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// App-specific imports
import app.onetap.access.ContactProxyActivity;
import app.onetap.access.CrashLogger;
import app.onetap.access.DesktopWebViewActivity;
import app.onetap.access.FileProxyActivity;
import app.onetap.access.LinkProxyActivity;
import app.onetap.access.MainActivity;
import app.onetap.access.MessageProxyActivity;
import app.onetap.access.NativeUsageTracker;
import app.onetap.access.NativeVideoPlayerActivity;
import app.onetap.access.NotificationClickActivity;
import app.onetap.access.NotificationHelper;
import app.onetap.access.PDFProxyActivity;
import app.onetap.access.ScheduledActionReceiver;
import app.onetap.access.ShortcutEditProxyActivity;
import app.onetap.access.SlideshowProxyActivity;
import app.onetap.access.TextProxyActivity;
import app.onetap.access.VideoProxyActivity;
import app.onetap.access.WhatsAppProxyActivity;

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
        ),
        @Permission(
            alias = "notifications",
            strings = { "android.permission.POST_NOTIFICATIONS" }
        ),
        @Permission(
            alias = "callPhone",
            strings = { Manifest.permission.CALL_PHONE }
        )
    }
)
public class ShortcutPlugin extends Plugin {

    // Maximum video size allowed for shortcuts (100MB)
    // Videos larger than this cannot have shortcuts created
    private static final long VIDEO_CACHE_THRESHOLD = 100 * 1024 * 1024;
    
    // Legacy threshold for general file copying (5MB)
    private static final long FILE_SIZE_THRESHOLD = 5 * 1024 * 1024;

    // Shortcut creation registry: tracks every shortcut ID we've ever created
    // with its creation timestamp. Used as secondary source of truth when
    // ShortcutManager returns unreliable data (OEM issues, race conditions).
    private static final String REGISTRY_PREFS = "shortcut_creation_registry";
    private static final long CREATION_COOLDOWN_MS = 30_000; // 30 seconds — allows slow launcher pin confirmations
    
    private PluginCall pendingPermissionCall;

    // ========== Shortcut Creation Registry Methods ==========

    /**
     * Record that a shortcut was created at the current time.
     * Called after successful requestPinShortcut().
     */
    private void registerShortcutCreation(String id) {
        Context ctx = getContext();
        if (ctx == null) return;
        SharedPreferences prefs = ctx.getSharedPreferences(REGISTRY_PREFS, Context.MODE_PRIVATE);
        prefs.edit().putLong(id, System.currentTimeMillis()).apply();
        android.util.Log.d("ShortcutPlugin", "Registered shortcut creation: " + id);
    }

    /**
     * Remove a shortcut from the creation registry.
     * Called when a shortcut is explicitly deleted from the app.
     */
    private void unregisterShortcut(String id) {
        Context ctx = getContext();
        if (ctx == null) return;
        SharedPreferences prefs = ctx.getSharedPreferences(REGISTRY_PREFS, Context.MODE_PRIVATE);
        prefs.edit().remove(id).apply();
        android.util.Log.d("ShortcutPlugin", "Unregistered shortcut: " + id);
    }

    /**
     * Get all registered shortcut IDs from the creation registry.
     */
    private List<String> getRegisteredShortcutIds() {
        Context ctx = getContext();
        if (ctx == null) return new ArrayList<>();
        SharedPreferences prefs = ctx.getSharedPreferences(REGISTRY_PREFS, Context.MODE_PRIVATE);
        return new ArrayList<>(prefs.getAll().keySet());
    }

    /**
     * Get IDs of shortcuts created within the cooldown period (last 10 seconds).
     * These are protected from sync deletion to avoid race conditions.
     */
    private List<String> getRecentlyCreatedIds() {
        Context ctx = getContext();
        if (ctx == null) return new ArrayList<>();
        SharedPreferences prefs = ctx.getSharedPreferences(REGISTRY_PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        List<String> recent = new ArrayList<>();
        for (java.util.Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            if (entry.getValue() instanceof Long) {
                long created = (Long) entry.getValue();
                if (now - created < CREATION_COOLDOWN_MS) {
                    recent.add(entry.getKey());
                }
            }
        }
        return recent;
    }

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
            android.util.Log.w("ShortcutPlugin", "ShortcutManager API not supported — attempting legacy INSTALL_SHORTCUT broadcast fallback (Nova, Action, Microsoft Launcher)");
            // Bug 4 fix: fall back to the legacy broadcast API supported by third-party launchers.
            // The shortcut info isn't built yet at this point, so we return a deferred-fallback signal
            // handled by JS (success:false + legacyFallback:true allows the caller to show guidance).
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("legacyFallback", true);
            result.put("error", "Launcher does not support the modern pinned shortcuts API. Please use your launcher's built-in shortcut feature or switch to a supported launcher.");
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
        String textContent = null;
        boolean isChecklist = false;
        try {
            JSObject extras = call.getObject("extras");
            if (extras != null) {
                whatsappPhoneNumber = extras.optString("phone_number", null);
                whatsappQuickMessages = extras.optString("quick_messages", null);
                whatsappContactName = extras.optString("contact_name", null);
                String tc = extras.optString("text_content", null);
                if (tc != null && !tc.isEmpty()) textContent = tc;
                String ic = extras.optString("is_checklist", null);
                if (ic != null) isChecklist = "true".equalsIgnoreCase(ic);
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
        final String finalTextContent = textContent;
        final boolean finalIsChecklist = isChecklist;

        // ── Text shortcuts: no file I/O needed, handle synchronously ──────────
        if ("app.onetap.OPEN_TEXT".equals(intentAction)) {
            android.util.Log.d("ShortcutPlugin", "Using TextProxyActivity for text shortcut");
            Intent textIntent = new Intent(context, TextProxyActivity.class);
            textIntent.setAction("app.onetap.OPEN_TEXT");
            textIntent.setData(intentData != null ? Uri.parse(intentData) : Uri.parse("onetap://text/" + id));
            textIntent.putExtra("shortcut_id", id);
            if (finalTextContent != null) textIntent.putExtra("text_content", finalTextContent);
            textIntent.putExtra("is_checklist", finalIsChecklist);
            textIntent.putExtra("shortcut_name", finalLabel);
            textIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Icon textIcon = createIcon(call);
            ShortcutInfo textShortcutInfo = new ShortcutInfo.Builder(context, id)
                    .setShortLabel(label)
                    .setLongLabel(label)
                    .setIcon(textIcon)
                    .setIntent(textIntent)
                    .build();

            ShortcutManager sm = context.getSystemService(ShortcutManager.class);
            // Bug 1 fix: provide a no-op PendingIntent so OEM launchers (Samsung/Xiaomi/OPPO)
            // don't silently reject the pin request when callback is null.
            PendingIntent textPinCallback = null;
            try {
                Intent callbackIntent = new Intent("app.onetap.SHORTCUT_PINNED");
                callbackIntent.setPackage(context.getPackageName());
                int cbFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    cbFlags |= android.app.PendingIntent.FLAG_IMMUTABLE;
                }
                textPinCallback = android.app.PendingIntent.getBroadcast(context, 0, callbackIntent, cbFlags);
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "Could not create text callback PendingIntent: " + e.getMessage());
            }
            boolean requested = sm.requestPinShortcut(textShortcutInfo,
                    textPinCallback != null ? textPinCallback.getIntentSender() : null);
            if (requested) {
                registerShortcutCreation(id);
                ensureDynamicShortcutSlot(sm);
                try {
                    sm.addDynamicShortcuts(Collections.singletonList(textShortcutInfo));
                } catch (Exception dynEx) {
                    android.util.Log.w("ShortcutPlugin", "Dynamic shortcut registration failed for text: " + dynEx.getMessage());
                }
            }
            JSObject textResult = new JSObject();
            textResult.put("success", requested);
            call.resolve(textResult);
            return;
        }

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
                // Bug 3 fix: Do NOT add FLAG_ACTIVITY_NEW_TASK to shortcut intents.
                // For ShortcutInfo intents, the OS controls launch flags when the user taps the icon.
                // Adding FLAG_ACTIVITY_NEW_TASK can cause rerouting to MainActivity on Pixel Android 14+
                // and some Xiaomi/MIUI variants instead of launching the intended proxy activity.
                if (finalUseVideoProxy != null && finalUseVideoProxy) {
                    android.util.Log.d("ShortcutPlugin", "Using VideoProxyActivity for video shortcut");
                    intent = new Intent(context, VideoProxyActivity.class);
                    intent.setAction("app.onetap.OPEN_VIDEO");
                    intent.setDataAndType(finalDataUri, finalIntentType != null ? finalIntentType : "video/*");
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
                    intent.putExtra("shortcut_title", finalLabel);
                    intent.putExtra("resume_enabled", finalResumeEnabled != null && finalResumeEnabled);
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
                } else if ("app.onetap.OPEN_MESSAGE".equals(finalIntentAction)) {
                    // WhatsApp shortcuts (0-1 messages) - route through MessageProxyActivity
                    android.util.Log.d("ShortcutPlugin", "Using MessageProxyActivity for message shortcut");
                    intent = new Intent(context, MessageProxyActivity.class);
                    intent.setAction("app.onetap.OPEN_MESSAGE");
                    intent.setData(finalDataUri);
                    // Pass URL as extra for reliable access
                    intent.putExtra(MessageProxyActivity.EXTRA_URL, finalDataUri.toString());
                    // Pass shortcut ID for usage tracking
                    intent.putExtra(MessageProxyActivity.EXTRA_SHORTCUT_ID, finalId);
                } else if ("app.onetap.OPEN_SLIDESHOW".equals(finalIntentAction)) {
                    // Slideshow shortcuts - route through SlideshowProxyActivity
                    android.util.Log.d("ShortcutPlugin", "Using SlideshowProxyActivity for slideshow shortcut");
                    intent = new Intent(context, SlideshowProxyActivity.class);
                    intent.setAction("app.onetap.OPEN_SLIDESHOW");
                    intent.setData(finalDataUri);
                    // Pass shortcut ID for usage tracking and slideshow content lookup
                    intent.putExtra(SlideshowProxyActivity.EXTRA_SHORTCUT_ID, finalId);
                    // Pass shortcut title for display
                    intent.putExtra(SlideshowProxyActivity.EXTRA_SHORTCUT_TITLE, finalLabel);
                } else if (finalIntentType != null && finalIntentType.startsWith("image/")) {
                    // Image file shortcuts - route through SlideshowProxyActivity for built-in viewer
                    android.util.Log.d("ShortcutPlugin", "Using SlideshowProxyActivity for image file shortcut");
                    intent = new Intent(context, SlideshowProxyActivity.class);
                    intent.setAction("app.onetap.OPEN_SLIDESHOW");
                    intent.setData(finalDataUri);
                    intent.putExtra(SlideshowProxyActivity.EXTRA_SHORTCUT_ID, finalId);
                    intent.putExtra(SlideshowProxyActivity.EXTRA_SHORTCUT_TITLE, finalLabel);
                } else {
                    // Generic file shortcuts (audio, documents, etc.) - route through FileProxyActivity
                    // This ensures tap tracking works for all file types
                    android.util.Log.d("ShortcutPlugin", "Using FileProxyActivity for generic file shortcut");
                    intent = new Intent(context, FileProxyActivity.class);
                    intent.setAction("app.onetap.OPEN_FILE");
                    intent.setDataAndType(finalDataUri, finalIntentType != null ? finalIntentType : "*/*");
                    // Pass shortcut ID for usage tracking
                    intent.putExtra(FileProxyActivity.EXTRA_SHORTCUT_ID, finalId);
                    // Pass MIME type for external app resolution
                    intent.putExtra(FileProxyActivity.EXTRA_MIME_TYPE, finalIntentType);
                    // Pass shortcut title for display
                    intent.putExtra(FileProxyActivity.EXTRA_SHORTCUT_TITLE, finalLabel);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
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
                        // Bug 1 fix: provide a no-op PendingIntent so OEM launchers (Samsung/Xiaomi/OPPO)
                        // don't silently reject the pin request when callback is null.
                        PendingIntent pinCallback = null;
                        try {
                            Intent callbackIntent = new Intent("app.onetap.SHORTCUT_PINNED");
                            callbackIntent.setPackage(context.getPackageName());
                            int cbFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                cbFlags |= PendingIntent.FLAG_IMMUTABLE;
                            }
                            pinCallback = PendingIntent.getBroadcast(context, 0, callbackIntent, cbFlags);
                        } catch (Exception e) {
                            android.util.Log.w("ShortcutPlugin", "Could not create callback PendingIntent: " + e.getMessage());
                        }
                        // Request pinning
                        boolean requested = shortcutManager.requestPinShortcut(finalShortcutInfo,
                                pinCallback != null ? pinCallback.getIntentSender() : null);
                        android.util.Log.d("ShortcutPlugin", "requestPinShortcut returned: " + requested);

                        // Also register as dynamic shortcut so OEM launchers (OnePlus, Xiaomi, OPPO, Vivo)
                        // can track pinned IDs via getShortcuts(FLAG_MATCH_PINNED)
                        if (requested) {
                            // Register in creation registry FIRST (before shadow registration)
                            // This protects the shortcut from sync deletion during the race window
                            registerShortcutCreation(finalId);

                            ensureDynamicShortcutSlot(shortcutManager);
                            try {
                                shortcutManager.addDynamicShortcuts(Collections.singletonList(finalShortcutInfo));
                                android.util.Log.d("ShortcutPlugin", "Pushed shadow dynamic shortcut: " + finalId);
                            } catch (Exception dynEx) {
                                android.util.Log.w("ShortcutPlugin", "Failed to register dynamic shortcut: " + dynEx.getMessage());
                                // Critical: without the shadow registration, sync will delete this shortcut.
                                // Attempt aggressive eviction and retry once.
                                try {
                                    evictOldestDynamicShortcut(shortcutManager);
                                    shortcutManager.addDynamicShortcuts(Collections.singletonList(finalShortcutInfo));
                                    android.util.Log.d("ShortcutPlugin", "Shadow dynamic shortcut registered after eviction: " + finalId);
                                } catch (Exception retryEx) {
                                    android.util.Log.e("ShortcutPlugin", "Shadow registration failed even after eviction: " + retryEx.getMessage());
                                }
                            }
                        }

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
                int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
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

        // Generate thumbnail for images (Fix #2 from plan)
        if (mimeType != null && mimeType.startsWith("image/")) {
            Context ctx = getContext();
            if (ctx != null) {
                String thumbnail = generateImageThumbnailBase64(ctx, uri, 256);
                if (thumbnail != null) {
                    ret.put("thumbnail", thumbnail);
                    android.util.Log.d("ShortcutPlugin", "Generated thumbnail for single image picker");
                }
            }
        }

        call.resolve(ret);
    }

    /**
     * Pick multiple files from the system document picker.
     * Used for slideshow creation - allows selecting up to maxCount images.
     * Returns an array of file objects with URIs and generated thumbnails.
     */
    @PluginMethod
    public void pickMultipleFiles(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "pickMultipleFiles called");

        if (getActivity() == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Activity is null");
            call.resolve(result);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);  // Enable multi-select

        // Default to images, but allow caller to restrict by MIME types
        intent.setType("image/*");
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

        startActivityForResult(call, intent, "pickMultipleFilesResult");
    }

    @ActivityCallback
    private void pickMultipleFilesResult(PluginCall call, ActivityResult result) {
        android.util.Log.d("ShortcutPlugin", "pickMultipleFilesResult called");

        JSObject ret = new JSObject();

        if (call == null) {
            android.util.Log.w("ShortcutPlugin", "pickMultipleFilesResult: PluginCall is null");
            return;
        }

        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            ret.put("success", false);
            ret.put("error", "cancelled");
            call.resolve(ret);
            return;
        }

        Intent data = result.getData();
        if (data == null) {
            ret.put("success", false);
            ret.put("error", "No files selected");
            call.resolve(ret);
            return;
        }

        // Get max count from call, default to 20
        Integer maxCount = call.getInt("maxCount", 20);
        
        List<Uri> selectedUris = new ArrayList<>();
        
        // Check for multiple selections via ClipData
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            int count = Math.min(clipData.getItemCount(), maxCount);
            for (int i = 0; i < count; i++) {
                Uri uri = clipData.getItemAt(i).getUri();
                if (uri != null) {
                    selectedUris.add(uri);
                }
            }
        } else if (data.getData() != null) {
            // Single selection fallback
            selectedUris.add(data.getData());
        }

        if (selectedUris.isEmpty()) {
            ret.put("success", false);
            ret.put("error", "No files selected");
            call.resolve(ret);
            return;
        }

        android.util.Log.d("ShortcutPlugin", "Selected " + selectedUris.size() + " files");

        // Process files on background thread to avoid UI freezing
        final List<Uri> finalUris = selectedUris;
        new Thread(() -> {
            JSArray filesArray = new JSArray();
            Context context = getContext();
            
            for (Uri uri : finalUris) {
                try {
                    // Persist permission where possible
                    if (context != null) {
                        int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
                        try {
                            context.getContentResolver().takePersistableUriPermission(uri, takeFlags);
                            android.util.Log.d("ShortcutPlugin", "Persisted URI permission: " + uri);
                        } catch (Exception e) {
                            android.util.Log.w("ShortcutPlugin", "Could not persist URI permission: " + e.getMessage());
                        }
                    }

                    JSObject fileObj = new JSObject();
                    fileObj.put("uri", uri.toString());

                    // Get file metadata
                    if (context != null) {
                        ContentResolver resolver = context.getContentResolver();
                        String mimeType = resolver.getType(uri);
                        if (mimeType != null) fileObj.put("mimeType", mimeType);

                        Cursor cursor = resolver.query(uri, null, null, null, null);
                        if (cursor != null) {
                            if (cursor.moveToFirst()) {
                                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                                if (nameIndex >= 0) {
                                    String name = cursor.getString(nameIndex);
                                    if (name != null) fileObj.put("name", name);
                                }

                                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                                if (sizeIndex >= 0) {
                                    long size = cursor.getLong(sizeIndex);
                                    fileObj.put("size", size);
                                }
                            }
                            cursor.close();
                        }

                        // Generate thumbnail for the image (256px for icon use)
                        String thumbnail = generateImageThumbnailBase64(context, uri, 256);
                        if (thumbnail != null) {
                            fileObj.put("thumbnail", thumbnail);
                        }
                    }

                    filesArray.put(fileObj);
                } catch (Exception e) {
                    android.util.Log.w("ShortcutPlugin", "Failed to process file: " + uri + " - " + e.getMessage());
                }
            }

            // Return result on main thread
            getActivity().runOnUiThread(() -> {
                JSObject finalRet = new JSObject();
                finalRet.put("success", true);
                finalRet.put("files", filesArray);
                call.resolve(finalRet);
            });
        }).start();
    }

    /**
     * Generate a base64-encoded JPEG thumbnail for an image URI.
     * Handles EXIF rotation to ensure images are displayed correctly.
     */
    private String generateImageThumbnailBase64(Context context, Uri uri, int maxSize) {
        try {
            // Read EXIF orientation BEFORE decoding bitmap
            int rotation = getExifRotation(context, uri);
            
            InputStream inputStream = context.getContentResolver().openInputStream(uri);
            if (inputStream == null) return null;

            // Decode with sample size for efficiency
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(inputStream, null, options);
            inputStream.close();

            int originalWidth = options.outWidth;
            int originalHeight = options.outHeight;
            int sampleSize = 1;
            while (originalWidth / sampleSize > maxSize * 2 || originalHeight / sampleSize > maxSize * 2) {
                sampleSize *= 2;
            }

            options = new BitmapFactory.Options();
            options.inSampleSize = sampleSize;

            inputStream = context.getContentResolver().openInputStream(uri);
            if (inputStream == null) return null;

            Bitmap bitmap = BitmapFactory.decodeStream(inputStream, null, options);
            inputStream.close();

            if (bitmap == null) return null;

            // Apply EXIF rotation if needed
            if (rotation != 0) {
                Matrix rotationMatrix = new Matrix();
                rotationMatrix.postRotate(rotation);
                Bitmap rotatedBitmap = Bitmap.createBitmap(bitmap, 0, 0, 
                    bitmap.getWidth(), bitmap.getHeight(), rotationMatrix, true);
                if (rotatedBitmap != bitmap) {
                    bitmap.recycle();
                    bitmap = rotatedBitmap;
                }
            }

            // Scale to target size
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            float scale = Math.min((float) maxSize / width, (float) maxSize / height);
            
            if (scale < 1) {
                int newWidth = Math.round(width * scale);
                int newHeight = Math.round(height * scale);
                Bitmap scaledBitmap = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true);
                if (scaledBitmap != bitmap) {
                    bitmap.recycle();
                    bitmap = scaledBitmap;
                }
            }

            // Encode to JPEG base64
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, baos);
            byte[] bytes = baos.toByteArray();
            bitmap.recycle();
            
            return Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "Failed to generate thumbnail for: " + uri + " - " + e.getMessage());
            return null;
        }
    }

    /**
     * Read EXIF orientation from image URI and return rotation degrees.
     * Handles 90°, 180°, and 270° rotations based on EXIF metadata.
     */
    private int getExifRotation(Context context, Uri uri) {
        try {
            InputStream input = context.getContentResolver().openInputStream(uri);
            if (input == null) return 0;
            
            ExifInterface exif = new ExifInterface(input);
            int orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION, 
                ExifInterface.ORIENTATION_NORMAL
            );
            input.close();
            
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    return 90;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    return 180;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    return 270;
                case ExifInterface.ORIENTATION_TRANSPOSE:
                    return 90; // Transposed + rotated
                case ExifInterface.ORIENTATION_TRANSVERSE:
                    return 270; // Transversed + rotated
                default:
                    return 0;
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "Could not read EXIF orientation: " + e.getMessage());
            return 0;
        }
    }


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
        String displayName = call.getString("displayName", null);

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
            
            // Set ClipData with meaningful display name for external app
            String label = (displayName != null && !displayName.isEmpty()) ? displayName : "File";
            try {
                android.content.ClipData clipData = android.content.ClipData.newUri(
                    context.getContentResolver(), label, uri);
                intent.setClipData(clipData);
                android.util.Log.d("ShortcutPlugin", "Set ClipData with label: " + label);
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "Failed to set ClipData: " + e.getMessage());
            }
            
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
        
        // Priority 2: Platform icon (branded icons for recognized URLs)
        String platformIcon = call.getString("iconPlatform");
        if (platformIcon != null && !platformIcon.isEmpty()) {
            android.util.Log.d("ShortcutPlugin", "Creating platform icon: " + platformIcon);
            return createPlatformIcon(platformIcon);
        }
        
        // Priority 3: Favicon URL (for unrecognized URLs)
        String faviconUrl = call.getString("iconFaviconUrl");
        if (faviconUrl != null && !faviconUrl.isEmpty()) {
            android.util.Log.d("ShortcutPlugin", "Creating icon from favicon URL: " + faviconUrl);
            Icon icon = createFaviconIcon(faviconUrl);
            if (icon != null) {
                return icon;
            }
            // Fall through to emoji fallback if favicon fetch fails
        }
        
        // Priority 4: Icon URI (data URL or file URI)
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
        
        // Priority 5: Emoji icon
        String emoji = call.getString("iconEmoji");
        if (emoji != null) {
            android.util.Log.d("ShortcutPlugin", "Creating emoji icon: " + emoji);
            return createEmojiIcon(emoji);
        }

        // Priority 6: Text icon
        String text = call.getString("iconText");
        if (text != null) {
            android.util.Log.d("ShortcutPlugin", "Creating text icon: " + text);
            return createTextIcon(text);
        }

        // Priority 7: Auto-generate video thumbnail if this is a video file
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
    
    // Create icon from favicon URL - fetches the favicon and renders it centered on neutral background
    // Favicons are displayed at 70% scale on white background to match native app icon appearance
    private Icon createFaviconIcon(String faviconUrl) {
        try {
            // Fetch favicon image from URL
            java.net.URL url = new java.net.URL(faviconUrl);
            java.net.HttpURLConnection connection = (java.net.HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (compatible; OneTapBot/1.0)");
            
            InputStream inputStream = connection.getInputStream();
            Bitmap faviconBitmap = BitmapFactory.decodeStream(inputStream);
            inputStream.close();
            connection.disconnect();
            
            if (faviconBitmap == null) {
                android.util.Log.w("ShortcutPlugin", "Failed to decode favicon bitmap");
                return null;
            }
            
            // Create adaptive icon canvas
            int adaptiveSize = 216;
            Bitmap bitmap = Bitmap.createBitmap(adaptiveSize, adaptiveSize, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            
            // Fill background with white for adaptive icon mask compatibility
            // The launcher will apply its own mask shape (circle, squircle, etc.)
            Paint bgPaint = new Paint();
            bgPaint.setColor(Color.WHITE);
            bgPaint.setStyle(Paint.Style.FILL);
            canvas.drawRect(0, 0, adaptiveSize, adaptiveSize, bgPaint);
            
            // Scale favicon to 70% of the icon size for larger, more visible appearance
            float iconSize = adaptiveSize * 0.70f;
            float scale = iconSize / Math.max(faviconBitmap.getWidth(), faviconBitmap.getHeight());
            int scaledWidth = (int) (faviconBitmap.getWidth() * scale);
            int scaledHeight = (int) (faviconBitmap.getHeight() * scale);
            
            Bitmap scaledFavicon = Bitmap.createScaledBitmap(faviconBitmap, scaledWidth, scaledHeight, true);
            
            // Center the favicon
            float left = (adaptiveSize - scaledWidth) / 2f;
            float top = (adaptiveSize - scaledHeight) / 2f;
            
            canvas.drawBitmap(scaledFavicon, left, top, null);
            
            android.util.Log.d("ShortcutPlugin", "Created favicon icon from URL (white bg, 70% scale)");
            return Icon.createWithAdaptiveBitmap(bitmap);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Failed to create favicon icon: " + e.getMessage());
            return null;
        }
    }
    
    // Create branded platform icon with brand-colored logo on white background
    // Icons are displayed at 70% scale with their original brand colors for authentic native app appearance
    private Icon createPlatformIcon(String platformKey) {
        // Adaptive icon size: 108dp * 2 = 216px for foreground layer
        int adaptiveSize = 216;
        Bitmap bitmap = Bitmap.createBitmap(adaptiveSize, adaptiveSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        
        // Get platform-specific brand color (used for the icon fill, not background)
        int brandColor = getPlatformColor(platformKey);
        
        // Fill background with white for adaptive icon mask compatibility
        // The launcher will apply its own mask shape (circle, squircle, etc.)
        Paint bgPaint = new Paint();
        bgPaint.setColor(Color.WHITE);
        bgPaint.setStyle(Paint.Style.FILL);
        canvas.drawRect(0, 0, adaptiveSize, adaptiveSize, bgPaint);
        
        // Try to get platform SVG path
        Path iconPath = getPlatformPath(platformKey);
        
        if (iconPath != null) {
            // Draw the actual logo path with brand color (not white/black)
            Paint iconPaint = new Paint();
            iconPaint.setColor(brandColor); // Use brand color for the icon itself
            iconPaint.setAntiAlias(true);
            iconPaint.setStyle(Paint.Style.FILL);
            
            // Scale and center the path at 70% for larger, more prominent appearance
            RectF pathBounds = new RectF();
            iconPath.computeBounds(pathBounds, true);
            
            float iconSize = adaptiveSize * 0.70f; // Larger icon (was 0.45)
            float scaleX = iconSize / pathBounds.width();
            float scaleY = iconSize / pathBounds.height();
            float scale = Math.min(scaleX, scaleY);
            
            Matrix matrix = new Matrix();
            matrix.setScale(scale, scale);
            matrix.postTranslate(
                (adaptiveSize - pathBounds.width() * scale) / 2 - pathBounds.left * scale,
                (adaptiveSize - pathBounds.height() * scale) / 2 - pathBounds.top * scale
            );
            iconPath.transform(matrix);
            
            canvas.drawPath(iconPath, iconPaint);
            android.util.Log.d("ShortcutPlugin", "Created platform icon with SVG path (white bg, brand color) for: " + platformKey);
        } else {
            // Fallback to letter/symbol for unsupported platforms - use brand color
            drawPlatformLetterWithColor(canvas, platformKey, adaptiveSize, brandColor);
            android.util.Log.d("ShortcutPlugin", "Created platform icon with letter (white bg, brand color) for: " + platformKey);
        }
        
        return Icon.createWithAdaptiveBitmap(bitmap);
    }
    
    // Draw fallback letter/symbol for platforms without SVG paths (legacy, uses white/black)
    private void drawPlatformLetter(Canvas canvas, String platformKey, int size, boolean useWhite) {
        String letter = getPlatformLetter(platformKey);
        Paint textPaint = new Paint();
        textPaint.setColor(useWhite ? Color.WHITE : Color.BLACK);
        textPaint.setTextSize(size * 0.4f);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setAntiAlias(true);
        textPaint.setFakeBoldText(true);
        float y = (size / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2);
        canvas.drawText(letter, size / 2f, y, textPaint);
    }
    
    // Draw fallback letter/symbol for platforms without SVG paths using brand color
    private void drawPlatformLetterWithColor(Canvas canvas, String platformKey, int size, int color) {
        String letter = getPlatformLetter(platformKey);
        Paint textPaint = new Paint();
        textPaint.setColor(color);
        textPaint.setTextSize(size * 0.5f); // Larger text at 50% (was 40%)
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setAntiAlias(true);
        textPaint.setFakeBoldText(true);
        float y = (size / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2);
        canvas.drawText(letter, size / 2f, y, textPaint);
    }
    
    // Get platform SVG path for actual logo rendering (top 15+ platforms)
    private Path getPlatformPath(String platformKey) {
        Path path = new Path();
        
        switch (platformKey) {
            case "youtube":
                // YouTube play button - simplified version (viewBox 0 0 24 24)
                path.moveTo(19.615f, 3.184f);
                path.cubicTo(16.011f, 2.938f, 7.984f, 2.939f, 4.385f, 3.184f);
                path.cubicTo(0.488f, 3.45f, 0.029f, 5.804f, 0f, 12f);
                path.cubicTo(0.029f, 18.185f, 0.484f, 20.549f, 4.385f, 20.816f);
                path.cubicTo(7.985f, 21.061f, 16.011f, 21.062f, 19.615f, 20.816f);
                path.cubicTo(23.512f, 20.55f, 23.971f, 18.196f, 24f, 12f);
                path.cubicTo(23.971f, 5.815f, 23.516f, 3.451f, 19.615f, 3.184f);
                path.close();
                // Play triangle
                path.moveTo(9f, 16f);
                path.lineTo(9f, 8f);
                path.lineTo(17f, 12f);
                path.close();
                return path;
                
            case "netflix":
                // Netflix N logo (viewBox 0 0 24 24)
                path.moveTo(5.398f, 0f);
                path.lineTo(5.398f, 0.006f);
                path.cubicTo(8.426f, 8.562f, 10.768f, 15.181f, 13.746f, 23.602f);
                path.cubicTo(16.09f, 23.66f, 18.596f, 24f, 18.6f, 24f);
                path.cubicTo(15.8f, 16.076f, 12.677f, 7.253f, 10.113f, 0f);
                path.close();
                path.moveTo(13.887f, 0f);
                path.lineTo(13.887f, 9.63f);
                path.lineTo(18.6f, 22.951f);
                path.cubicTo(18.557f, 15.091f, 18.596f, 7.038f, 18.602f, 0.001f);
                path.close();
                path.moveTo(5.398f, 1.05f);
                path.lineTo(5.398f, 24f);
                path.cubicTo(7.271f, 23.775f, 8.208f, 23.688f, 10.113f, 23.602f);
                path.lineTo(10.113f, 14.382f);
                path.close();
                return path;
                
            case "instagram":
                // Instagram camera (viewBox 0 0 24 24)
                path.addRoundRect(new RectF(2, 2, 22, 22), 5, 5, Path.Direction.CW);
                // Inner circle (cut out - we'll draw strokes instead)
                Path innerPath = new Path();
                innerPath.addCircle(12, 12, 4, Path.Direction.CW);
                path.op(innerPath, Path.Op.DIFFERENCE);
                // Top-right dot
                path.addCircle(17.5f, 6.5f, 1.5f, Path.Direction.CW);
                return path;
                
            case "twitter":
                // X/Twitter logo (viewBox 0 0 24 24)
                path.moveTo(18.244f, 2.25f);
                path.lineTo(21.552f, 2.25f);
                path.lineTo(14.325f, 10.51f);
                path.lineTo(22.827f, 21.75f);
                path.lineTo(16.17f, 21.75f);
                path.lineTo(10.956f, 14.933f);
                path.lineTo(4.99f, 21.75f);
                path.lineTo(1.68f, 21.75f);
                path.lineTo(9.41f, 12.915f);
                path.lineTo(1.254f, 2.25f);
                path.lineTo(8.08f, 2.25f);
                path.lineTo(12.793f, 8.481f);
                path.close();
                path.moveTo(17.083f, 19.77f);
                path.lineTo(18.916f, 19.77f);
                path.lineTo(7.084f, 4.126f);
                path.lineTo(5.117f, 4.126f);
                path.close();
                return path;
                
            case "spotify":
                // Spotify logo (viewBox 0 0 24 24)
                path.addCircle(12, 12, 12, Path.Direction.CW);
                // We'll use strokes for the waves, so return circle only
                // For solid fill, we create approximated wave paths
                Path wavePath = new Path();
                // Top wave
                wavePath.moveTo(6.5f, 9.5f);
                wavePath.cubicTo(9.5f, 8f, 14.5f, 8f, 17.5f, 9.5f);
                wavePath.lineTo(17.5f, 10.5f);
                wavePath.cubicTo(14.5f, 9f, 9.5f, 9f, 6.5f, 10.5f);
                wavePath.close();
                // Middle wave
                wavePath.moveTo(7f, 12f);
                wavePath.cubicTo(9.5f, 10.8f, 14.5f, 10.8f, 17f, 12f);
                wavePath.lineTo(17f, 13f);
                wavePath.cubicTo(14.5f, 11.8f, 9.5f, 11.8f, 7f, 13f);
                wavePath.close();
                // Bottom wave
                wavePath.moveTo(7.5f, 14.5f);
                wavePath.cubicTo(9.5f, 13.5f, 14.5f, 13.5f, 16.5f, 14.5f);
                wavePath.lineTo(16.5f, 15.5f);
                wavePath.cubicTo(14.5f, 14.5f, 9.5f, 14.5f, 7.5f, 15.5f);
                wavePath.close();
                path.op(wavePath, Path.Op.DIFFERENCE);
                return path;
                
            case "whatsapp":
                // WhatsApp phone icon (viewBox 0 0 24 24)
                path.moveTo(17.472f, 14.382f);
                path.cubicTo(17.175f, 14.233f, 15.714f, 13.515f, 15.442f, 13.415f);
                path.cubicTo(15.169f, 13.316f, 14.971f, 13.267f, 14.772f, 13.565f);
                path.cubicTo(14.575f, 13.862f, 14.005f, 14.531f, 13.832f, 14.729f);
                path.cubicTo(13.659f, 14.928f, 13.485f, 14.952f, 13.188f, 14.804f);
                path.cubicTo(12.891f, 14.654f, 11.933f, 14.341f, 10.798f, 13.329f);
                path.cubicTo(9.915f, 12.541f, 9.318f, 11.568f, 9.145f, 11.27f);
                path.cubicTo(8.972f, 10.973f, 9.127f, 10.812f, 9.275f, 10.664f);
                path.cubicTo(9.409f, 10.531f, 9.573f, 10.317f, 9.721f, 10.144f);
                path.cubicTo(9.87f, 9.97f, 9.919f, 9.846f, 10.019f, 9.647f);
                path.cubicTo(10.118f, 9.449f, 10.069f, 9.276f, 9.994f, 9.127f);
                path.cubicTo(9.919f, 8.978f, 9.325f, 7.515f, 9.078f, 6.92f);
                path.cubicTo(8.836f, 6.341f, 8.591f, 6.42f, 8.409f, 6.41f);
                path.cubicTo(8.236f, 6.402f, 8.038f, 6.4f, 7.839f, 6.4f);
                path.cubicTo(7.641f, 6.4f, 7.319f, 6.474f, 7.047f, 6.772f);
                path.cubicTo(6.775f, 7.069f, 6.007f, 7.788f, 6.007f, 9.251f);
                path.cubicTo(6.007f, 10.713f, 7.072f, 12.126f, 7.22f, 12.325f);
                path.cubicTo(7.369f, 12.523f, 9.316f, 15.525f, 12.297f, 16.812f);
                path.cubicTo(13.006f, 17.118f, 13.559f, 17.301f, 13.991f, 17.437f);
                path.cubicTo(14.703f, 17.664f, 15.351f, 17.632f, 15.862f, 17.555f);
                path.cubicTo(16.433f, 17.47f, 17.62f, 16.836f, 17.868f, 16.142f);
                path.cubicTo(18.116f, 15.448f, 18.116f, 14.853f, 18.041f, 14.729f);
                path.cubicTo(17.967f, 14.605f, 17.769f, 14.531f, 17.472f, 14.382f);
                path.close();
                // Outer circle
                path.moveTo(12.051f, 21.785f);
                path.lineTo(12.047f, 21.785f);
                path.cubicTo(10.314f, 21.785f, 8.616f, 21.333f, 7.016f, 20.407f);
                path.lineTo(6.655f, 20.193f);
                path.lineTo(2.914f, 21.175f);
                path.lineTo(3.912f, 17.527f);
                path.lineTo(3.677f, 17.153f);
                path.cubicTo(2.671f, 15.362f, 2.167f, 13.363f, 2.168f, 11.293f);
                path.cubicTo(2.169f, 5.843f, 6.604f, 1.409f, 12.056f, 1.409f);
                path.cubicTo(14.696f, 1.409f, 17.178f, 2.439f, 19.044f, 4.307f);
                path.cubicTo(20.91f, 6.175f, 21.937f, 8.659f, 21.937f, 11.301f);
                path.cubicTo(21.934f, 16.751f, 17.5f, 21.185f, 12.052f, 21.185f);
                path.close();
                return path;
                
            case "telegram":
                // Telegram paper plane (viewBox 0 0 24 24)
                path.addCircle(12, 12, 12, Path.Direction.CW);
                // Paper plane cutout
                Path planePath = new Path();
                planePath.moveTo(16.906f, 7.224f);
                planePath.cubicTo(17.006f, 7.222f, 17.227f, 7.247f, 17.371f, 7.364f);
                planePath.cubicTo(17.488f, 7.461f, 17.522f, 7.594f, 17.542f, 7.689f);
                planePath.cubicTo(17.558f, 7.782f, 17.578f, 7.995f, 17.562f, 8.161f);
                planePath.cubicTo(17.382f, 10.059f, 16.6f, 14.663f, 16.202f, 16.788f);
                planePath.cubicTo(16.034f, 17.688f, 15.703f, 17.989f, 15.382f, 18.018f);
                planePath.cubicTo(14.686f, 18.083f, 14.157f, 17.558f, 13.482f, 17.116f);
                planePath.cubicTo(12.426f, 16.423f, 11.829f, 15.992f, 10.804f, 15.316f);
                planePath.cubicTo(9.619f, 14.536f, 10.387f, 14.106f, 11.062f, 13.406f);
                planePath.cubicTo(11.239f, 13.222f, 14.309f, 10.429f, 14.369f, 10.176f);
                planePath.cubicTo(14.376f, 10.144f, 14.383f, 10.026f, 14.313f, 9.964f);
                planePath.cubicTo(14.243f, 9.902f, 14.139f, 9.923f, 14.064f, 9.94f);
                planePath.cubicTo(13.958f, 9.964f, 12.271f, 11.08f, 9.003f, 13.285f);
                planePath.cubicTo(8.523f, 13.615f, 8.09f, 13.775f, 7.701f, 13.765f);
                planePath.cubicTo(7.273f, 13.757f, 6.449f, 13.524f, 5.836f, 13.325f);
                planePath.cubicTo(5.084f, 13.08f, 4.487f, 12.951f, 4.539f, 12.536f);
                planePath.cubicTo(4.566f, 12.32f, 4.864f, 12.099f, 5.432f, 11.873f);
                planePath.cubicTo(8.93f, 10.349f, 11.262f, 9.344f, 12.43f, 8.859f);
                planePath.cubicTo(15.762f, 7.473f, 16.455f, 7.232f, 16.906f, 7.224f);
                planePath.close();
                path.op(planePath, Path.Op.DIFFERENCE);
                return path;
                
            case "facebook":
                // Facebook F logo (viewBox 0 0 24 24)
                path.addCircle(12, 12, 12, Path.Direction.CW);
                Path fPath = new Path();
                fPath.moveTo(15.75f, 5.25f);
                fPath.lineTo(13.5f, 5.25f);
                fPath.cubicTo(12.12f, 5.25f, 10.5f, 5.85f, 10.5f, 8.1f);
                fPath.lineTo(10.5f, 9.75f);
                fPath.lineTo(8.25f, 9.75f);
                fPath.lineTo(8.25f, 12.75f);
                fPath.lineTo(10.5f, 12.75f);
                fPath.lineTo(10.5f, 21f);
                fPath.lineTo(13.5f, 21f);
                fPath.lineTo(13.5f, 12.75f);
                fPath.lineTo(15.45f, 12.75f);
                fPath.lineTo(15.75f, 9.75f);
                fPath.lineTo(13.5f, 9.75f);
                fPath.lineTo(13.5f, 8.4f);
                fPath.cubicTo(13.5f, 7.65f, 13.8f, 7.5f, 14.25f, 7.5f);
                fPath.lineTo(15.75f, 7.5f);
                fPath.close();
                path.op(fPath, Path.Op.DIFFERENCE);
                return path;
                
            case "linkedin":
                // LinkedIn logo (viewBox 0 0 24 24)
                path.addRoundRect(new RectF(0, 0, 24, 24), 2, 2, Path.Direction.CW);
                Path liPath = new Path();
                // "in" text area cutouts
                liPath.addCircle(6.5f, 6.5f, 2f, Path.Direction.CW);
                liPath.addRect(new RectF(4.5f, 9f, 8.5f, 20f), Path.Direction.CW);
                liPath.addRect(new RectF(10f, 9f, 14f, 20f), Path.Direction.CW);
                liPath.moveTo(14f, 13f);
                liPath.cubicTo(14f, 11f, 15.5f, 9f, 18f, 9f);
                liPath.lineTo(20f, 9f);
                liPath.lineTo(20f, 20f);
                liPath.lineTo(16f, 20f);
                liPath.lineTo(16f, 14f);
                liPath.cubicTo(16f, 13f, 15.5f, 12f, 14f, 13f);
                path.op(liPath, Path.Op.DIFFERENCE);
                return path;
                
            case "github":
                // GitHub octocat (viewBox 0 0 24 24)
                path.moveTo(12f, 0.297f);
                path.cubicTo(5.37f, 0.297f, 0f, 5.67f, 0f, 12.297f);
                path.cubicTo(0f, 17.6f, 3.438f, 22.097f, 8.205f, 23.682f);
                path.cubicTo(8.805f, 23.795f, 9.025f, 23.424f, 9.025f, 23.105f);
                path.cubicTo(9.025f, 22.82f, 9.015f, 22.065f, 9.01f, 21.065f);
                path.cubicTo(5.672f, 21.789f, 4.968f, 19.455f, 4.968f, 19.455f);
                path.cubicTo(4.422f, 18.07f, 3.633f, 17.7f, 3.633f, 17.7f);
                path.cubicTo(2.546f, 16.956f, 3.717f, 16.971f, 3.717f, 16.971f);
                path.cubicTo(4.922f, 17.055f, 5.555f, 18.207f, 5.555f, 18.207f);
                path.cubicTo(6.625f, 20.042f, 8.364f, 19.512f, 9.05f, 19.205f);
                path.cubicTo(9.158f, 18.429f, 9.467f, 17.9f, 9.81f, 17.6f);
                path.cubicTo(7.145f, 17.3f, 4.344f, 16.268f, 4.344f, 11.67f);
                path.cubicTo(4.344f, 10.36f, 4.809f, 9.29f, 5.579f, 8.45f);
                path.cubicTo(5.444f, 8.147f, 5.039f, 6.927f, 5.684f, 5.274f);
                path.cubicTo(5.684f, 5.274f, 6.689f, 4.952f, 8.984f, 6.504f);
                path.cubicTo(9.944f, 6.237f, 10.964f, 6.105f, 11.984f, 6.099f);
                path.cubicTo(13.004f, 6.105f, 14.024f, 6.237f, 14.984f, 6.504f);
                path.cubicTo(17.264f, 4.952f, 18.269f, 5.274f, 18.269f, 5.274f);
                path.cubicTo(18.914f, 6.927f, 18.509f, 8.147f, 18.389f, 8.45f);
                path.cubicTo(19.154f, 9.29f, 19.619f, 10.36f, 19.619f, 11.67f);
                path.cubicTo(19.619f, 16.28f, 16.814f, 17.295f, 14.144f, 17.59f);
                path.cubicTo(14.564f, 17.95f, 14.954f, 18.686f, 14.954f, 19.81f);
                path.cubicTo(14.954f, 21.416f, 14.939f, 22.706f, 14.939f, 23.096f);
                path.cubicTo(14.939f, 23.411f, 15.149f, 23.786f, 15.764f, 23.666f);
                path.cubicTo(20.565f, 22.092f, 24f, 17.592f, 24f, 12.297f);
                path.cubicTo(24f, 5.67f, 18.627f, 0.297f, 12f, 0.297f);
                path.close();
                return path;
                
            case "tiktok":
                // TikTok logo (viewBox 0 0 24 24)
                path.moveTo(12.525f, 0.02f);
                path.cubicTo(13.835f, 0f, 15.135f, 0.01f, 16.435f, 0f);
                path.cubicTo(16.515f, 1.53f, 17.065f, 3.09f, 18.185f, 4.17f);
                path.cubicTo(19.305f, 5.28f, 20.885f, 5.79f, 22.425f, 5.96f);
                path.lineTo(22.425f, 9.99f);
                path.cubicTo(20.985f, 9.94f, 19.535f, 9.64f, 18.225f, 9.02f);
                path.cubicTo(17.655f, 8.76f, 17.125f, 8.43f, 16.605f, 8.09f);
                path.cubicTo(16.595f, 11.01f, 16.615f, 13.93f, 16.585f, 16.84f);
                path.cubicTo(16.505f, 18.24f, 16.045f, 19.63f, 15.235f, 20.78f);
                path.cubicTo(13.925f, 22.7f, 11.655f, 23.95f, 9.325f, 23.99f);
                path.cubicTo(7.895f, 24.07f, 6.465f, 23.68f, 5.245f, 22.96f);
                path.cubicTo(3.225f, 21.77f, 1.805f, 19.59f, 1.595f, 17.25f);
                path.cubicTo(1.575f, 16.75f, 1.565f, 16.25f, 1.585f, 15.76f);
                path.cubicTo(1.765f, 13.86f, 2.705f, 12.04f, 4.165f, 10.8f);
                path.cubicTo(5.825f, 9.36f, 8.145f, 8.67f, 10.315f, 9.08f);
                path.cubicTo(10.335f, 10.56f, 10.275f, 12.04f, 10.275f, 13.52f);
                path.cubicTo(9.285f, 13.2f, 8.125f, 13.29f, 7.255f, 13.89f);
                path.cubicTo(6.625f, 14.3f, 6.145f, 14.93f, 5.895f, 15.64f);
                path.cubicTo(5.685f, 16.15f, 5.745f, 16.71f, 5.755f, 17.25f);
                path.cubicTo(5.995f, 18.89f, 7.575f, 20.27f, 9.255f, 20.12f);
                path.cubicTo(10.375f, 20.11f, 11.445f, 19.46f, 12.025f, 18.51f);
                path.cubicTo(12.215f, 18.18f, 12.425f, 17.84f, 12.435f, 17.45f);
                path.cubicTo(12.535f, 15.66f, 12.495f, 13.88f, 12.505f, 12.09f);
                path.cubicTo(12.515f, 8.06f, 12.495f, 4.04f, 12.525f, 0.02f);
                path.close();
                return path;
                
            case "reddit":
                // Reddit alien (simplified - viewBox 0 0 24 24)
                path.addCircle(12, 12, 12, Path.Direction.CW);
                // Eyes and face cutouts
                Path redditPath = new Path();
                redditPath.addCircle(8f, 13.5f, 1.5f, Path.Direction.CW);
                redditPath.addCircle(16f, 13.5f, 1.5f, Path.Direction.CW);
                path.op(redditPath, Path.Op.DIFFERENCE);
                return path;
                
            case "discord":
                // Discord logo (viewBox 0 0 24 24)
                path.moveTo(20.317f, 4.3698f);
                path.cubicTo(18.7873f, 3.6535f, 17.147f, 3.1193f, 15.4319f, 2.8186f);
                path.cubicTo(15.4233f, 2.8157f, 15.4141f, 2.8188f, 15.4085f, 2.8277f);
                path.cubicTo(15.1975f, 3.203f, 14.9638f, 3.6925f, 14.8002f, 4.0772f);
                path.cubicTo(12.9555f, 3.801f, 11.12f, 3.801f, 9.3134f, 4.0772f);
                path.cubicTo(9.1498f, 3.6839f, 8.9076f, 3.203f, 8.6957f, 2.8277f);
                path.cubicTo(8.6901f, 2.8197f, 8.6809f, 2.8166f, 8.6724f, 2.8186f);
                path.cubicTo(6.9581f, 3.1184f, 5.3178f, 3.6526f, 3.7872f, 4.3689f);
                path.cubicTo(3.782f, 4.3709f, 3.7776f, 4.3746f, 3.7745f, 4.3793f);
                path.cubicTo(0.5334f, 9.0458f, -0.319f, 13.5799f, 0.0992f, 18.0578f);
                path.cubicTo(0.1004f, 18.0701f, 0.1072f, 18.0819f, 0.1169f, 18.0894f);
                path.cubicTo(2.1697f, 19.597f, 4.1582f, 20.5122f, 6.1098f, 21.1188f);
                path.cubicTo(6.1183f, 21.1217f, 6.1276f, 21.1188f, 6.134f, 21.1108f);
                path.cubicTo(6.5956f, 20.4804f, 7.0071f, 19.8156f, 7.36f, 19.1166f);
                path.cubicTo(7.3681f, 19.1002f, 7.3604f, 19.0811f, 7.3433f, 19.0738f);
                path.cubicTo(6.6905f, 18.8262f, 6.0688f, 18.5243f, 5.4711f, 18.1815f);
                path.cubicTo(5.4522f, 18.1704f, 5.4507f, 18.1427f, 5.4683f, 18.1291f);
                path.cubicTo(5.5941f, 18.0348f, 5.72f, 17.9368f, 5.8401f, 17.8377f);
                path.cubicTo(5.8483f, 17.8309f, 5.8595f, 17.8295f, 5.869f, 17.8339f);
                path.cubicTo(9.7968f, 19.6272f, 14.0468f, 19.6272f, 17.9304f, 17.8339f);
                path.cubicTo(17.9399f, 17.8286f, 17.9511f, 17.83f, 17.9601f, 17.8368f);
                path.cubicTo(18.0803f, 17.9359f, 18.2061f, 18.0348f, 18.3329f, 18.1291f);
                path.cubicTo(18.3505f, 18.1427f, 18.3498f, 18.1704f, 18.3309f, 18.1815f);
                path.cubicTo(17.7332f, 18.5309f, 17.1115f, 18.8262f, 16.4579f, 19.0729f);
                path.cubicTo(16.4408f, 19.0802f, 16.434f, 19.1002f, 16.442f, 19.1166f);
                path.cubicTo(16.8024f, 19.8147f, 17.2139f, 20.4795f, 17.667f, 21.1099f);
                path.cubicTo(17.6726f, 21.1188f, 17.6827f, 21.1217f, 17.6912f, 21.1188f);
                path.cubicTo(19.6521f, 20.5122f, 21.6406f, 19.597f, 23.6934f, 18.0894f);
                path.cubicTo(23.7039f, 18.0819f, 23.7099f, 18.0709f, 23.7111f, 18.0586f);
                path.cubicTo(24.2115f, 12.881f, 22.8729f, 8.3839f, 20.2626f, 4.3793f);
                path.cubicTo(20.2602f, 4.3746f, 20.2558f, 4.3709f, 20.2498f, 4.3689f);
                path.close();
                path.moveTo(8.02f, 15.3312f);
                path.cubicTo(6.8375f, 15.3312f, 5.8631f, 14.2455f, 5.8631f, 12.9122f);
                path.cubicTo(5.8631f, 11.579f, 6.8186f, 10.4933f, 8.0201f, 10.4933f);
                path.cubicTo(9.2309f, 10.4933f, 10.1958f, 11.5885f, 10.1769f, 12.9122f);
                path.cubicTo(10.1769f, 14.2455f, 9.2214f, 15.3312f, 8.02f, 15.3312f);
                path.close();
                path.moveTo(15.9948f, 15.3312f);
                path.cubicTo(14.8123f, 15.3312f, 13.8379f, 14.2455f, 13.8379f, 12.9122f);
                path.cubicTo(13.8379f, 11.579f, 14.7933f, 10.4933f, 15.9948f, 10.4933f);
                path.cubicTo(17.2056f, 10.4933f, 18.1705f, 11.5885f, 18.1516f, 12.9122f);
                path.cubicTo(18.1516f, 14.2455f, 17.2056f, 15.3312f, 15.9948f, 15.3312f);
                path.close();
                return path;
                
            case "pinterest":
                // Pinterest P logo (viewBox 0 0 24 24)
                path.addCircle(12, 12, 12, Path.Direction.CW);
                Path pPath = new Path();
                pPath.moveTo(9.04f, 21.54f);
                pPath.cubicTo(8.71f, 20.59f, 8.5f, 19.58f, 8.42f, 18.54f);
                pPath.lineTo(9.91f, 12.48f);
                pPath.cubicTo(9.42f, 11.56f, 9.16f, 10.53f, 9.16f, 9.44f);
                pPath.cubicTo(9.16f, 6.75f, 10.63f, 4.95f, 12.58f, 4.95f);
                pPath.cubicTo(14.14f, 4.95f, 15.03f, 6.05f, 15.03f, 7.42f);
                pPath.cubicTo(15.03f, 8.97f, 14.13f, 11.27f, 13.65f, 13.39f);
                pPath.cubicTo(13.25f, 15.14f, 14.46f, 16.58f, 16.18f, 16.58f);
                pPath.cubicTo(19.28f, 16.58f, 21.31f, 12.57f, 21.31f, 7.85f);
                pPath.cubicTo(21.31f, 3.83f, 18.36f, 1.13f, 13.99f, 1.13f);
                pPath.cubicTo(8.84f, 1.13f, 5.71f, 4.87f, 5.71f, 9.05f);
                pPath.cubicTo(5.71f, 10.58f, 6.27f, 12.01f, 7.14f, 12.98f);
                pPath.close();
                path.op(pPath, Path.Op.DIFFERENCE);
                return path;
                
            case "amazon":
                // Amazon smile logo (simplified - viewBox 0 0 24 24)
                path.moveTo(0.045f, 18.02f);
                path.cubicTo(0.117f, 17.904f, 0.232f, 17.896f, 0.393f, 17.998f);
                path.cubicTo(4.029f, 20.108f, 7.987f, 21.164f, 12.263f, 21.164f);
                path.cubicTo(15.115f, 21.164f, 17.931f, 20.631f, 20.71f, 19.569f);
                path.lineTo(21.025f, 19.429f);
                path.cubicTo(21.163f, 19.369f, 21.259f, 19.329f, 21.318f, 19.299f);
                path.cubicTo(21.544f, 19.211f, 21.708f, 19.253f, 21.843f, 19.429f);
                path.cubicTo(21.963f, 19.603f, 21.933f, 19.765f, 21.723f, 19.909f);
                path.cubicTo(21.467f, 20.099f, 21.123f, 20.319f, 20.717f, 20.563f);
                path.cubicTo(19.473f, 21.306f, 18.077f, 21.879f, 16.532f, 22.289f);
                path.cubicTo(14.413f, 22.849f, 12.222f, 22.929f, 9.996f, 22.549f);
                path.cubicTo(7.556f, 22.139f, 5.311f, 21.208f, 3.293f, 19.777f);
                path.close();
                return path;
                
            default:
                return null; // Fall back to letter
        }
    }
    
    // Get platform brand color
    private int getPlatformColor(String platformKey) {
        switch (platformKey) {
            case "youtube": return Color.parseColor("#DC2626");
            case "instagram": return Color.parseColor("#E11D48");
            case "twitter": return Color.BLACK;
            case "facebook": return Color.parseColor("#1877F2");
            case "linkedin": return Color.parseColor("#0A66C2");
            case "github": return Color.parseColor("#181717");
            case "reddit": return Color.parseColor("#FF4500");
            case "tiktok": return Color.BLACK;
            case "pinterest": return Color.parseColor("#BD081C");
            case "spotify": return Color.parseColor("#1DB954");
            case "twitch": return Color.parseColor("#9146FF");
            case "discord": return Color.parseColor("#5865F2");
            case "whatsapp": return Color.parseColor("#25D366");
            case "telegram": return Color.parseColor("#0088CC");
            case "medium": return Color.BLACK;
            case "vimeo": return Color.parseColor("#1AB7EA");
            case "dribbble": return Color.parseColor("#EA4C89");
            case "behance": return Color.parseColor("#1769FF");
            case "figma": return Color.parseColor("#F24E1E");
            case "notion": return Color.BLACK;
            case "slack": return Color.parseColor("#4A154B");
            case "amazon": return Color.parseColor("#FF9900");
            case "netflix": return Color.parseColor("#E50914");
            case "google-drive": return Color.parseColor("#4285F4");
            case "google": return Color.parseColor("#4285F4");
            case "apple": return Color.BLACK;
            case "microsoft": return Color.parseColor("#00A4EF");
            case "dropbox": return Color.parseColor("#0061FF");
            case "trello": return Color.parseColor("#0052CC");
            case "asana": return Color.parseColor("#F06A6A");
            case "zoom": return Color.parseColor("#2D8CFF");
            case "snapchat": return Color.parseColor("#FFFC00");
            default: return Color.parseColor("#2563EB"); // Primary blue fallback
        }
    }
    
    // Get platform letter/symbol for fallback icon
    private String getPlatformLetter(String platformKey) {
        switch (platformKey) {
            case "youtube": return "▶";
            case "instagram": return "📷";
            case "twitter": return "𝕏";
            case "facebook": return "f";
            case "linkedin": return "in";
            case "github": return "⌥";
            case "reddit": return "r";
            case "tiktok": return "♪";
            case "pinterest": return "P";
            case "spotify": return "♫";
            case "twitch": return "⚡";
            case "discord": return "🎮";
            case "whatsapp": return "💬";
            case "telegram": return "✈";
            case "medium": return "M";
            case "vimeo": return "▶";
            case "dribbble": return "🏀";
            case "behance": return "Bē";
            case "figma": return "◈";
            case "notion": return "N";
            case "slack": return "#";
            case "amazon": return "a";
            case "netflix": return "N";
            case "google-drive": return "△";
            case "google": return "G";
            case "apple": return "";
            case "microsoft": return "⊞";
            case "dropbox": return "📦";
            case "trello": return "▣";
            case "asana": return "∞";
            case "zoom": return "📹";
            case "snapchat": return "👻";
            default: return "🔗";
        }
    }
    
    // Determine if platform should use white or black icon/text
    private boolean shouldUseWhiteText(String platformKey) {
        switch (platformKey) {
            case "amazon":
            case "snapchat":
                return false; // Use black icon on light backgrounds
            default:
                return true; // Use white icon on dark backgrounds
        }
    }
    
    // Create icon from base64 image data
    private Icon createBitmapIcon(String base64Data) {
        try {
            byte[] decoded = Base64.decode(base64Data, Base64.DEFAULT);

            // Bug 2 fix: use a two-pass decode to avoid OOM on low-RAM devices when the
            // input base64 encodes a large image. First pass measures dimensions without
            // allocating the full pixel buffer; second pass decodes at a safe subsampled size.
            BitmapFactory.Options sizeOpts = new BitmapFactory.Options();
            sizeOpts.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(decoded, 0, decoded.length, sizeOpts);

            int sampleSize = 1;
            while (sizeOpts.outWidth / sampleSize > 512 || sizeOpts.outHeight / sampleSize > 512) {
                sampleSize *= 2;
            }

            BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
            decodeOpts.inSampleSize = sampleSize;
            Bitmap bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.length, decodeOpts);

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

            // Bug 6 fix: createScaledBitmap may return the same object as 'bitmap' when
            // dimensions already match. Only recycle 'bitmap' if it is a different object.
            // Do NOT recycle 'scaled' — the Icon holds an internal reference to adaptiveBitmap
            // which was drawn from 'scaled'; recycling 'scaled' here is safe since we already
            // drew it onto adaptiveBitmap, but we must never recycle adaptiveBitmap itself.
            if (scaled != bitmap) {
                bitmap.recycle();
            }
            // 'scaled' is no longer needed after drawing onto adaptiveBitmap
            if (scaled != adaptiveBitmap) {
                scaled.recycle();
            }

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

                    // Query display name from ContentResolver
                    try {
                        android.database.Cursor cursor = getContext().getContentResolver().query(
                            uri,
                            new String[]{OpenableColumns.DISPLAY_NAME},
                            null, null, null
                        );
                        if (cursor != null) {
                            if (cursor.moveToFirst()) {
                                String name = cursor.getString(0);
                                if (name != null) {
                                    result.put("name", name);
                                    android.util.Log.d("ShortcutPlugin", "Shared file name: " + name);
                                }
                            }
                            cursor.close();
                        }
                    } catch (Exception e) {
                        android.util.Log.w("ShortcutPlugin",
                            "Could not get display name for shared file: " + e.getMessage());
                    }
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
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            // Handle multiple files shared via Share Sheet
            android.util.Log.d("ShortcutPlugin", "ACTION_SEND_MULTIPLE detected");
            
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris == null || uris.isEmpty()) {
                android.util.Log.w("ShortcutPlugin", "SEND_MULTIPLE but no URIs found");
                call.resolve(null);
                return;
            }
            
            ContentResolver resolver = getContext().getContentResolver();
            int imageCount = 0;
            int totalCount = uris.size();
            boolean hasNonImage = false;
            boolean hasImage = false;
            
            // Classify all URIs by MIME type
            for (Uri uri : uris) {
                String mimeType = resolver.getType(uri);
                if (mimeType != null && mimeType.startsWith("image/")) {
                    imageCount++;
                    hasImage = true;
                } else {
                    hasNonImage = true;
                }
            }
            
            boolean allImages = hasImage && !hasNonImage;
            boolean mixed = hasImage && hasNonImage;
            
            JSObject result = new JSObject();
            result.put("action", action);
            result.put("type", type);
            result.put("multipleFiles", true);
            result.put("fileCount", totalCount);
            result.put("allImages", allImages);
            result.put("mixed", mixed);
            
            // Only provide file details when all images (the only valid multi-file path)
            if (allImages) {
                JSArray filesArray = new JSArray();
                for (Uri uri : uris) {
                    // Take persistable read permission so URIs survive activity restarts
                    try {
                        getContext().getContentResolver().takePersistableUriPermission(
                            uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (SecurityException e) {
                        android.util.Log.w("ShortcutPlugin", "Could not take persistable permission for: " + uri + " - " + e.getMessage());
                    }
                    
                    String mimeType = resolver.getType(uri);
                    String name = null;
                    try {
                        Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
                        if (cursor != null) {
                            if (cursor.moveToFirst()) {
                                name = cursor.getString(0);
                            }
                            cursor.close();
                        }
                    } catch (Exception e) {
                        android.util.Log.w("ShortcutPlugin", "Could not get display name for: " + uri);
                    }
                    
                    JSObject fileObj = new JSObject();
                    fileObj.put("uri", uri.toString());
                    fileObj.put("mimeType", mimeType);
                    if (name != null) fileObj.put("name", name);
                    filesArray.put(fileObj);
                }
                result.put("files", filesArray);
            }
            
            android.util.Log.d("ShortcutPlugin", "SEND_MULTIPLE: count=" + totalCount + 
                ", allImages=" + allImages + ", mixed=" + mixed);
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
                    // Save the call to resolve later in the callback
                    saveCall(call);
                    // Request permission using Capacitor's mechanism
                    requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
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

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        if (call == null) {
            return;
        }
        
        Activity activity = getActivity();
        boolean granted = false;
        
        if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            int permission = ContextCompat.checkSelfPermission(
                activity, 
                Manifest.permission.POST_NOTIFICATIONS
            );
            granted = permission == PackageManager.PERMISSION_GRANTED;
        }
        
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
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
        boolean granted = getPermissionState("callPhone") == PermissionState.GRANTED;
        result.put("granted", granted);
        if (!granted) {
            // If not granted, check if permanently denied (user selected "Don't ask again")
            // shouldShowRequestPermissionRationale returns false when:
            //   1. Permission has never been requested (first time) - but granted is also false
            //   2. User selected "Don't ask again" - permanently denied
            // We distinguish by checking if we've ever asked before via a flag
            android.app.Activity activity = getActivity();
            if (activity != null) {
                boolean shouldShowRationale = androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(
                    activity, android.Manifest.permission.CALL_PHONE);
                // If rationale is false AND permission is not granted, it's either first-time or permanently denied
                // We use SharedPreferences to track if we've asked before
                android.content.SharedPreferences prefs = activity.getSharedPreferences("call_permission_prefs", android.content.Context.MODE_PRIVATE);
                boolean hasAskedBefore = prefs.getBoolean("has_asked_call_phone", false);
                result.put("permanentlyDenied", !shouldShowRationale && hasAskedBefore);
            } else {
                result.put("permanentlyDenied", false);
            }
        } else {
            result.put("permanentlyDenied", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestCallPermission(PluginCall call) {
        if (getPermissionState("callPhone") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            result.put("permanentlyDenied", false);
            call.resolve(result);
            return;
        }

        // Check if permanently denied before trying to request
        android.app.Activity activity = getActivity();
        if (activity != null) {
            boolean shouldShowRationale = androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(
                activity, android.Manifest.permission.CALL_PHONE);
            android.content.SharedPreferences prefs = activity.getSharedPreferences("call_permission_prefs", android.content.Context.MODE_PRIVATE);
            boolean hasAskedBefore = prefs.getBoolean("has_asked_call_phone", false);

            if (!shouldShowRationale && hasAskedBefore) {
                // Permanently denied - system won't show the dialog
                android.util.Log.d("ShortcutPlugin", "CALL_PHONE permanently denied, returning immediately");
                JSObject result = new JSObject();
                result.put("granted", false);
                result.put("permanentlyDenied", true);
                call.resolve(result);
                return;
            }

            // Mark that we've asked before (do this before requesting)
            prefs.edit().putBoolean("has_asked_call_phone", true).apply();
        }

        requestPermissionForAlias("callPhone", call, "callPermissionCallback");
    }

    @PermissionCallback
    private void callPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = getPermissionState("callPhone") == PermissionState.GRANTED;
        result.put("granted", granted);
        result.put("permanentlyDenied", false); // If callback fires, it wasn't permanently denied
        call.resolve(result);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error opening app settings: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
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

    /**
     * Sync theme preference to SharedPreferences for native dialogs/activities.
     */
    @PluginMethod
    public void syncTheme(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "syncTheme called");

        try {
            Context context = getContext();
            if (context == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Context is null");
                call.resolve(result);
                return;
            }

            String theme = call.getString("theme", "system");
            String resolvedTheme = call.getString("resolvedTheme", "light");

            // Store in SharedPreferences for native component access
            SharedPreferences prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE);
            prefs.edit()
                .putString("theme", theme)
                .putString("resolvedTheme", resolvedTheme)
                .apply();

            android.util.Log.d("ShortcutPlugin", "Theme synced: " + theme + " (resolved: " + resolvedTheme + ")");

            // Immediately update system bar icon colors on the current activity
            Activity activity = getActivity();
            if (activity instanceof MainActivity) {
                activity.runOnUiThread(() -> {
                    ((MainActivity) activity).updateSystemBarAppearance();
                });
            }

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error syncing theme: " + e.getMessage());
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

    // ========== Slideshow Deep Link ==========

    /**
     * Get pending slideshow ID from deep link (from home screen shortcut tap).
     * Called by JS layer on app startup to navigate to slideshow viewer if needed.
     */
    @PluginMethod
    public void getPendingSlideshowId(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "getPendingSlideshowId called");

        try {
            Activity activity = getActivity();
            if (activity == null || !(activity instanceof MainActivity)) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "MainActivity not available");
                call.resolve(result);
                return;
            }

            MainActivity mainActivity = (MainActivity) activity;
            String slideshowId = mainActivity.getPendingSlideshowId();
            
            JSObject result = new JSObject();
            result.put("success", true);
            
            if (slideshowId != null && !slideshowId.isEmpty()) {
                result.put("slideshowId", slideshowId);
                android.util.Log.d("ShortcutPlugin", "Found pending slideshow ID: " + slideshowId);
            } else {
                android.util.Log.d("ShortcutPlugin", "No pending slideshow ID");
            }
            
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting pending slideshow ID: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Clear pending slideshow ID after it has been handled.
     */
    @PluginMethod
    public void clearPendingSlideshowId(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "clearPendingSlideshowId called");

        try {
            Activity activity = getActivity();
            if (activity == null || !(activity instanceof MainActivity)) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "MainActivity not available");
                call.resolve(result);
                return;
            }

            MainActivity mainActivity = (MainActivity) activity;
            mainActivity.clearPendingSlideshowId();
            
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error clearing pending slideshow ID: " + e.getMessage());
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

    /**
     * Open a text shortcut natively via TextProxyActivity.
     * The activity slides up from the bottom instantly — no Capacitor WebView reload.
     * Mirrors the openWhatsApp pattern exactly.
     */
    @PluginMethod
    public void openTextShortcut(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "openTextShortcut called");

        String shortcutId   = call.getString("shortcutId");
        String textContent  = call.getString("textContent", "");
        boolean isChecklist = Boolean.TRUE.equals(call.getBoolean("isChecklist", false));
        String name         = call.getString("name", "");

        try {
            Context context = getContext();
            Intent intent = new Intent(context, TextProxyActivity.class);
            intent.putExtra("shortcut_id",   shortcutId);
            intent.putExtra("text_content",  textContent);
            intent.putExtra("is_checklist",  isChecklist);
            intent.putExtra("shortcut_name", name);
            // Opened from inside the app — JS has already called incrementUsage().
            // Skip native NativeUsageTracker.recordTap() to prevent double-counting.
            intent.putExtra("skip_usage_tracking", true);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error opening TextProxyActivity: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    /**
     * Clears all local checklist check states for a given shortcut.
     * Called by JS layer when the user reorders checklist items during editing,
     * since state keys are index-based and reordering invalidates them.
     * SharedPreferences("checklist_state") is NOT synced to cloud.
     */
    @PluginMethod
    public void clearChecklistState(PluginCall call) {
        String shortcutId = call.getString("id");
        if (shortcutId == null || shortcutId.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Missing shortcut id");
            call.resolve(result);
            return;
        }
        try {
            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences("checklist_state", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            String prefix = "chk_" + shortcutId + "_";
            for (String key : new java.util.HashSet<>(prefs.getAll().keySet())) {
                if (key.startsWith(prefix)) editor.remove(key);
            }
            editor.apply();
            android.util.Log.d("ShortcutPlugin", "Cleared checklist state for: " + shortcutId);
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "clearChecklistState error: " + e.getMessage());
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
     * 
     * Android 12+ Note: Uses getShortcuts(FLAG_MATCH_PINNED) for more accurate results
     * and explicitly filters by isPinned() flag to handle edge cases where dynamic
     * shortcuts may persist after unpinning.
     */
    @PluginMethod
    public void getPinnedShortcutIds(PluginCall call) {
        android.util.Log.d("ShortcutPlugin", "getPinnedShortcutIds called, API=" + Build.VERSION.SDK_INT);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            // App requires Android 12+ (API 31), this shouldn't happen
            android.util.Log.w("ShortcutPlugin", "getPinnedShortcutIds: API " + Build.VERSION.SDK_INT + " < 31, returning empty");
            JSObject result = new JSObject();
            result.put("ids", new JSArray());
            result.put("registeredIds", new JSArray());
            result.put("recentlyCreatedIds", new JSArray());
            result.put("dynamicCount", -1);
            result.put("maxDynamic", -1);
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("error", true);
            call.resolve(result);
            return;
        }

        try {
            Context context = getContext();
            if (context == null) {
                android.util.Log.w("ShortcutPlugin", "getPinnedShortcutIds: context is null");
                JSObject result = new JSObject();
                result.put("ids", new JSArray());
                result.put("registeredIds", new JSArray());
                result.put("recentlyCreatedIds", new JSArray());
                result.put("dynamicCount", -1);
                result.put("maxDynamic", -1);
                result.put("manufacturer", Build.MANUFACTURER);
                result.put("error", true);
                call.resolve(result);
                return;
            }

            ShortcutManager manager = context.getSystemService(ShortcutManager.class);
            if (manager == null) {
                android.util.Log.w("ShortcutPlugin", "getPinnedShortcutIds: ShortcutManager is null");
                JSObject result = new JSObject();
                result.put("ids", new JSArray());
                result.put("registeredIds", new JSArray());
                result.put("recentlyCreatedIds", new JSArray());
                result.put("dynamicCount", -1);
                result.put("maxDynamic", -1);
                result.put("manufacturer", Build.MANUFACTURER);
                result.put("error", true);
                call.resolve(result);
                return;
            }

            // Android 12+: Always use getShortcuts(FLAG_MATCH_PINNED) for accurate pin state
            List<ShortcutInfo> pinnedShortcuts = manager.getShortcuts(ShortcutManager.FLAG_MATCH_PINNED);
            android.util.Log.d("ShortcutPlugin", "Using getShortcuts(FLAG_MATCH_PINNED) for API " + Build.VERSION.SDK_INT);
            
            // Also get dynamic shortcuts for cross-reference logging
            List<ShortcutInfo> dynamicShortcuts = manager.getDynamicShortcuts();
            android.util.Log.d("ShortcutPlugin", "Dynamic shortcuts count: " + dynamicShortcuts.size() + 
                ", Pinned query returned: " + pinnedShortcuts.size());
            
            JSArray ids = new JSArray();
            int actuallyPinned = 0;
            
            // Filter shortcuts that are actually pinned (extra verification for Android 12+)
            for (ShortcutInfo info : pinnedShortcuts) {
                // Log detailed state of each shortcut for debugging
                android.util.Log.d("ShortcutPlugin", "Shortcut: id=" + info.getId() + 
                    ", isPinned=" + info.isPinned() + 
                    ", isDynamic=" + info.isDynamic() + 
                    ", isEnabled=" + info.isEnabled());
                
                // Only include shortcuts that are truly pinned
                // This filter is essential on Android 12+ where the ShortcutManager may
                // return stale data for shortcuts that were unpinned from the home screen
                if (info.isPinned()) {
                    ids.put(info.getId());
                    actuallyPinned++;
                }
            }

            // Log device info for OEM-specific debugging
            String launcherPackage = "unknown";
            try {
                Intent launcherIntent = new Intent(Intent.ACTION_MAIN);
                launcherIntent.addCategory(Intent.CATEGORY_HOME);
                android.content.pm.ResolveInfo resolveInfo = context.getPackageManager()
                    .resolveActivity(launcherIntent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
                if (resolveInfo != null && resolveInfo.activityInfo != null) {
                    launcherPackage = resolveInfo.activityInfo.packageName;
                }
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "Could not determine launcher package: " + e.getMessage());
            }
            
            // Clean up orphaned dynamic shortcuts (dynamic but no longer pinned)
            // BUT protect recently-created shortcuts still in cooldown window
            SharedPreferences registryPrefs = context.getSharedPreferences(REGISTRY_PREFS, Context.MODE_PRIVATE);
            long nowMs = System.currentTimeMillis();
            List<String> orphanDynamicIds = new ArrayList<>();
            for (ShortcutInfo dynInfo : dynamicShortcuts) {
                if (!dynInfo.isPinned()) {
                    // Check if this shortcut is in the creation cooldown window
                    long createdAt = registryPrefs.getLong(dynInfo.getId(), 0);
                    if (createdAt > 0 && (nowMs - createdAt) < CREATION_COOLDOWN_MS) {
                        android.util.Log.d("ShortcutPlugin", "Skipping orphan cleanup for recently-created shortcut: " + dynInfo.getId());
                        continue;
                    }
                    orphanDynamicIds.add(dynInfo.getId());
                }
            }
            if (!orphanDynamicIds.isEmpty()) {
                manager.removeDynamicShortcuts(orphanDynamicIds);
                android.util.Log.d("ShortcutPlugin", "Cleaned up " + orphanDynamicIds.size() + " orphaned dynamic shortcuts");
            }

            android.util.Log.d("ShortcutPlugin", "getPinnedShortcutIds: API=" + Build.VERSION.SDK_INT + 
                ", manufacturer=" + Build.MANUFACTURER +
                ", launcher=" + launcherPackage +
                ", queryReturned=" + pinnedShortcuts.size() + 
                ", actuallyPinned=" + actuallyPinned +
                ", orphansCleaned=" + orphanDynamicIds.size());

            // Get registry data for cross-reference
            List<String> registeredIds = getRegisteredShortcutIds();
            List<String> recentlyCreatedIds = getRecentlyCreatedIds();
            
            JSArray registeredIdsArray = new JSArray();
            for (String regId : registeredIds) {
                registeredIdsArray.put(regId);
            }
            JSArray recentIdsArray = new JSArray();
            for (String recentId : recentlyCreatedIds) {
                recentIdsArray.put(recentId);
            }

            android.util.Log.d("ShortcutPlugin", "Registry: " + registeredIds.size() + " total, " + 
                recentlyCreatedIds.size() + " recently created (cooldown protected)");

            JSObject result = new JSObject();
            result.put("ids", ids);
            result.put("registeredIds", registeredIdsArray);
            result.put("recentlyCreatedIds", recentIdsArray);
            result.put("dynamicCount", dynamicShortcuts.size() - orphanDynamicIds.size());
            result.put("maxDynamic", manager.getMaxShortcutCountPerActivity());
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("error", false);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "Error getting pinned shortcuts: " + e.getMessage(), e);
            JSObject result = new JSObject();
            result.put("ids", new JSArray());
            result.put("registeredIds", new JSArray());
            result.put("recentlyCreatedIds", new JSArray());
            result.put("dynamicCount", -1);
            result.put("maxDynamic", -1);
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("error", true);
            call.resolve(result);
        }
    }

    /**
     * Disable and clean up a pinned shortcut.
     * 
     * IMPORTANT: Android does NOT allow apps to programmatically remove/unpin shortcuts
     * from the home screen. This is a security restriction.
     * 
     * What this method does:
     * 1. disableShortcuts() - Marks the shortcut as disabled so it shows a "deleted" message if tapped
     * 2. removeDynamicShortcuts() - Removes from dynamic shortcuts list
     * 3. removeLongLivedShortcuts() (API 30+) - Cleans up cached shortcut data
     * 
     * The user must manually remove the shortcut icon from their home screen.
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

            List<String> shortcutIds = new ArrayList<>();
            shortcutIds.add(shortcutId);
            
            // Step 1: Disable the shortcut - shows message if user taps the orphaned icon
            manager.disableShortcuts(shortcutIds, "This shortcut has been deleted. Please remove it from your home screen.");
            android.util.Log.d("ShortcutPlugin", "Disabled pinned shortcut: " + shortcutId);
            
            // Step 2: Remove from dynamic shortcuts (cleanup)
            try {
                manager.removeDynamicShortcuts(shortcutIds);
                android.util.Log.d("ShortcutPlugin", "Removed from dynamic shortcuts: " + shortcutId);
            } catch (Exception e) {
                android.util.Log.w("ShortcutPlugin", "removeDynamicShortcuts failed (may not exist): " + e.getMessage());
            }
            
            // Step 3: Remove long-lived shortcut cache (API 30+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    manager.removeLongLivedShortcuts(shortcutIds);
                    android.util.Log.d("ShortcutPlugin", "Removed long-lived shortcut: " + shortcutId);
                } catch (Exception e) {
                    android.util.Log.w("ShortcutPlugin", "removeLongLivedShortcuts failed: " + e.getMessage());
                }
            }

            // Clean up creation registry
            unregisterShortcut(shortcutId);

            JSObject result = new JSObject();
            result.put("success", true);
            // Flag indicating the user needs to manually remove the icon
            result.put("requiresManualRemoval", true);
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
        String textContent = call.getString("textContent");
        Boolean isChecklist = call.getBoolean("isChecklist", false);
        
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
                quickMessagesJson, contactName, resumeEnabled, contentUri, mimeType, label, shortcutId,
                textContent, isChecklist);

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
            
            // Also update dynamic shortcut registration for OEM launcher tracking
            ensureDynamicShortcutSlot(manager);
            try {
                manager.addDynamicShortcuts(shortcutsToUpdate);
                // Refresh registry timestamp to protect from eviction
                registerShortcutCreation(shortcutId);
                android.util.Log.d("ShortcutPlugin", "Pushed updated shadow dynamic shortcut: " + shortcutId);
            } catch (Exception dynEx) {
                android.util.Log.w("ShortcutPlugin", "Failed to update dynamic shortcut: " + dynEx.getMessage());
                try {
                    evictOldestDynamicShortcut(manager);
                    manager.addDynamicShortcuts(shortcutsToUpdate);
                    // Refresh registry timestamp to protect from eviction
                    registerShortcutCreation(shortcutId);
                    android.util.Log.d("ShortcutPlugin", "Shadow dynamic shortcut updated after eviction: " + shortcutId);
                } catch (Exception retryEx) {
                    android.util.Log.e("ShortcutPlugin", "Shadow update failed even after eviction: " + retryEx.getMessage());
                }
            }
            
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
     * 
     * IMPORTANT: All proxy intents MUST include shortcut_id for tap tracking!
     */
    private Intent buildIntentForUpdate(Context context, String shortcutType, String messageApp,
            String phoneNumber, String quickMessagesJson, String contactName,
            Boolean resumeEnabled, String contentUri, String mimeType, String label, String shortcutId,
            String textContent, Boolean isChecklist) {
        
        if (shortcutType == null) {
            // No type specified, can't rebuild intent
            return null;
        }
        
        Intent intent = null;
        
        if ("message".equals(shortcutType) && "whatsapp".equals(messageApp)) {
            // WhatsApp shortcut - route based on message count
            int messageCount = 0;
            if (quickMessagesJson != null) {
                try {
                    org.json.JSONArray arr = new org.json.JSONArray(quickMessagesJson);
                    messageCount = arr.length();
                } catch (Exception e) {
                    android.util.Log.w("ShortcutPlugin", "Error parsing quickMessages for count: " + e.getMessage());
                }
            }
            
            if (messageCount >= 2) {
                // Multi-message: use WhatsAppProxyActivity (shows dialog)
                android.util.Log.d("ShortcutPlugin", "Building WhatsApp multi-message intent for update");
                intent = new Intent(context, WhatsAppProxyActivity.class);
                intent.setAction("app.onetap.WHATSAPP_MESSAGE");
                intent.setData(Uri.parse("onetap://whatsapp/" + shortcutId));
                if (phoneNumber != null) {
                    intent.putExtra(WhatsAppProxyActivity.EXTRA_PHONE_NUMBER, phoneNumber);
                }
                intent.putExtra(WhatsAppProxyActivity.EXTRA_QUICK_MESSAGES, quickMessagesJson);
                if (contactName != null) {
                    intent.putExtra(WhatsAppProxyActivity.EXTRA_CONTACT_NAME, contactName);
                }
                // Add shortcut_id for tap tracking
                intent.putExtra(WhatsAppProxyActivity.EXTRA_SHORTCUT_ID, shortcutId);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            } else {
                // 0-1 message: use MessageProxyActivity (direct launch)
                android.util.Log.d("ShortcutPlugin", "Building WhatsApp single-message intent for update");
                intent = new Intent(context, MessageProxyActivity.class);
                intent.setAction("app.onetap.OPEN_MESSAGE");
                
                // Build WhatsApp URL
                String message = null;
                if (messageCount == 1) {
                    try {
                        org.json.JSONArray arr = new org.json.JSONArray(quickMessagesJson);
                        message = arr.getString(0);
                    } catch (Exception e) {}
                }
                String url = "https://wa.me/" + (phoneNumber != null ? phoneNumber : "");
                if (message != null && !message.isEmpty()) {
                    try {
                        url += "?text=" + java.net.URLEncoder.encode(message, "UTF-8");
                    } catch (Exception e) {}
                }
                
                intent.setData(Uri.parse(url));
                intent.putExtra(MessageProxyActivity.EXTRA_URL, url);
                intent.putExtra(MessageProxyActivity.EXTRA_SHORTCUT_ID, shortcutId);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }
            
        } else if ("contact".equals(shortcutType)) {
            // Contact dial shortcut - route through ContactProxyActivity
            android.util.Log.d("ShortcutPlugin", "Building Contact intent for update");
            intent = new Intent(context, ContactProxyActivity.class);
            intent.setAction("app.onetap.CALL_CONTACT");
            if (phoneNumber != null) {
                intent.setData(Uri.parse("tel:" + phoneNumber));
                intent.putExtra(ContactProxyActivity.EXTRA_PHONE_NUMBER, phoneNumber);
            }
            // Add shortcut_id for tap tracking
            intent.putExtra(ContactProxyActivity.EXTRA_SHORTCUT_ID, shortcutId);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
        } else if ("link".equals(shortcutType) && contentUri != null) {
            // Link shortcut - route through LinkProxyActivity
            android.util.Log.d("ShortcutPlugin", "Building Link intent for update");
            intent = new Intent(context, LinkProxyActivity.class);
            intent.setAction("app.onetap.OPEN_LINK");
            intent.setData(Uri.parse(contentUri));
            intent.putExtra(LinkProxyActivity.EXTRA_URL, contentUri);
            intent.putExtra(LinkProxyActivity.EXTRA_SHORTCUT_ID, shortcutId);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
        } else if ("file".equals(shortcutType) && contentUri != null && mimeType != null && mimeType.equals("application/pdf")) {
            // PDF file - route through PDFProxyActivity
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
            // Add shortcut_id for tap tracking
            intent.putExtra("shortcut_id", shortcutId);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
        } else if ("file".equals(shortcutType) && contentUri != null && mimeType != null && mimeType.startsWith("image/")) {
            // Image file - route through SlideshowProxyActivity for built-in viewer
            android.util.Log.d("ShortcutPlugin", "Building image intent for update via SlideshowProxyActivity");
            intent = new Intent(context, SlideshowProxyActivity.class);
            intent.setAction("app.onetap.OPEN_SLIDESHOW");
            intent.setData(Uri.parse(contentUri));
            intent.putExtra(SlideshowProxyActivity.EXTRA_SHORTCUT_ID, shortcutId);
            intent.putExtra(SlideshowProxyActivity.EXTRA_SHORTCUT_TITLE, label);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
        } else if ("file".equals(shortcutType) && contentUri != null) {
            // Generic file (audio, documents, etc.) - route through FileProxyActivity
            android.util.Log.d("ShortcutPlugin", "Building generic file intent for update, mimeType=" + mimeType);
            intent = new Intent(context, FileProxyActivity.class);
            intent.setAction("app.onetap.OPEN_FILE");
            intent.setDataAndType(Uri.parse(contentUri), mimeType != null ? mimeType : "*/*");
            intent.putExtra(FileProxyActivity.EXTRA_SHORTCUT_ID, shortcutId);
            intent.putExtra(FileProxyActivity.EXTRA_MIME_TYPE, mimeType);
            intent.putExtra(FileProxyActivity.EXTRA_SHORTCUT_TITLE, label);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
        } else if ("text".equals(shortcutType)) {
            // Text shortcut - rebuild intent with updated text content
            android.util.Log.d("ShortcutPlugin", "Building Text intent for update, isChecklist=" + isChecklist);
            intent = new Intent(context, TextProxyActivity.class);
            intent.setAction("app.onetap.OPEN_TEXT");
            intent.setData(Uri.parse("onetap://text/" + shortcutId));
            intent.putExtra("shortcut_id", shortcutId);
            if (textContent != null) {
                intent.putExtra("text_content", textContent);
            }
            intent.putExtra("is_checklist", isChecklist != null && isChecklist);
            intent.putExtra("shortcut_name", label != null ? label : "");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        }
        
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

    /**
     * Show a native Android toast message.
     * Used for brief informational messages that don't interrupt the user.
     */
    @PluginMethod
    public void showNativeToast(PluginCall call) {
        String message = call.getString("message");
        String duration = call.getString("duration", "short");
        
        if (message == null || message.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            call.resolve(result);
            return;
        }
        
        Activity activity = getActivity();
        if (activity == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            call.resolve(result);
            return;
        }
        
        int toastDuration = "long".equals(duration) 
            ? android.widget.Toast.LENGTH_LONG 
            : android.widget.Toast.LENGTH_SHORT;
        
        // Toast must be shown on UI thread
        activity.runOnUiThread(() -> {
            android.widget.Toast.makeText(activity, message, toastDuration).show();
        });
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    // ========== Crash Logs ==========

    /**
     * Get native crash logs for debugging.
     * Returns persisted error log and recent breadcrumbs from CrashLogger.
     */
    @PluginMethod
    public void getCrashLogs(PluginCall call) {
        CrashLogger logger = CrashLogger.getInstance();
        
        // Initialize with context if not already done
        Context context = getContext();
        if (context != null) {
            logger.initialize(context);
        }
        
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("errorLog", logger.getPersistedErrorLog());
        result.put("sessionId", logger.getSessionId());
        result.put("sessionDurationSeconds", logger.getSessionDurationSeconds());
        
        // Get recent breadcrumbs
        String[] breadcrumbs = logger.getRecentBreadcrumbs(50);
        JSArray breadcrumbArray = new JSArray();
        for (String b : breadcrumbs) {
            if (b != null) {
                breadcrumbArray.put(b);
            }
        }
        result.put("breadcrumbs", breadcrumbArray);
        
        call.resolve(result);
    }

    /**
     * Clear persisted crash logs.
     */
    @PluginMethod
    public void clearCrashLogs(PluginCall call) {
        CrashLogger logger = CrashLogger.getInstance();
        
        // Initialize with context if not already done
        Context context = getContext();
        if (context != null) {
            logger.initialize(context);
        }
        
        logger.clearErrorLog();
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Clean up the creation registry by removing entries that are:
     * 1. NOT in the OS pinned set (confirmed unpinned)
     * 2. Older than the cooldown period (not recently created)
     * Called from JS after successful reconciliation with ids.length > 0.
     */
    @PluginMethod
    public void cleanupRegistry(PluginCall call) {
        try {
            JSArray confirmedIdsArray = call.getArray("confirmedIds");
            if (confirmedIdsArray == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "confirmedIds is required");
                call.resolve(result);
                return;
            }

            Context ctx = getContext();
            if (ctx == null) {
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("pruned", 0);
                call.resolve(result);
                return;
            }

            // Build confirmed set
            Set<String> confirmedSet = new HashSet<>();
            for (int i = 0; i < confirmedIdsArray.length(); i++) {
                confirmedSet.add(confirmedIdsArray.getString(i));
            }

            SharedPreferences prefs = ctx.getSharedPreferences(REGISTRY_PREFS, Context.MODE_PRIVATE);
            Map<String, ?> allEntries = prefs.getAll();
            long now = System.currentTimeMillis();
            int pruned = 0;

            SharedPreferences.Editor editor = prefs.edit();
            for (Map.Entry<String, ?> entry : allEntries.entrySet()) {
                String id = entry.getKey();
                // Skip if confirmed pinned by OS
                if (confirmedSet.contains(id)) continue;
                // Skip if in cooldown window
                long createdAt = entry.getValue() instanceof Long ? (Long) entry.getValue() : 0;
                if (createdAt > 0 && (now - createdAt) < CREATION_COOLDOWN_MS) continue;
                // Prune: not pinned and not recently created
                editor.remove(id);
                pruned++;
            }
            editor.apply();

            android.util.Log.d("ShortcutPlugin", "cleanupRegistry: pruned " + pruned + " stale entries, " +
                (allEntries.size() - pruned) + " remaining");

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("pruned", pruned);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "cleanupRegistry error: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }

    // ========== Dynamic Shortcut Pool Management ==========

    /**
     * Ensure there is at least one slot available in the dynamic shortcut pool.
     * If the pool is at capacity, evict the oldest dynamic shortcut that is
     * already confirmed as pinned (it no longer needs the shadow registration
     * because Android already tracks it as pinned).
     *
     * This prevents the critical bug where addDynamicShortcuts() throws
     * IllegalArgumentException due to exceeding the per-app limit, which would
     * cause the shadow registration to fail and the shortcut to be deleted
     * on the next sync cycle.
     */
    private void ensureDynamicShortcutSlot(ShortcutManager manager) {
        try {
            List<ShortcutInfo> currentDynamic = manager.getDynamicShortcuts();
            int maxDynamic = manager.getMaxShortcutCountPerActivity();

            android.util.Log.d("ShortcutPlugin", "Dynamic pool: " + currentDynamic.size() + 
                "/" + maxDynamic + " slots used");

            if (currentDynamic.size() >= maxDynamic) {
                // Pool is full — evict the oldest pinned-but-dynamic shortcut
                // (it doesn't need the shadow anymore since it's already pinned)
                evictOldestDynamicShortcut(manager);
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "ensureDynamicShortcutSlot error: " + e.getMessage());
        }
    }

    /**
     * Remove the oldest dynamic shortcut that is already pinned.
     * If no pinned dynamic shortcuts exist, remove the oldest dynamic shortcut regardless.
     */
    private void evictOldestDynamicShortcut(ShortcutManager manager) {
        try {
            List<ShortcutInfo> currentDynamic = manager.getDynamicShortcuts();
            if (currentDynamic.isEmpty()) return;

            Context ctx = getContext();
            SharedPreferences prefs = ctx != null 
                ? ctx.getSharedPreferences(REGISTRY_PREFS, Context.MODE_PRIVATE) 
                : null;
            long now = System.currentTimeMillis();

            String oldestId = null;
            long oldestTime = Long.MAX_VALUE;

            // Pass 1: Prefer evicting pinned shortcuts outside cooldown (they don't need shadow)
            for (ShortcutInfo info : currentDynamic) {
                long created = prefs != null ? prefs.getLong(info.getId(), 0) : 0;
                // Never evict shortcuts in cooldown period
                if (now - created < CREATION_COOLDOWN_MS) continue;
                if (info.isPinned() && created < oldestTime) {
                    oldestId = info.getId();
                    oldestTime = created;
                }
            }

            // Pass 2: Fallback — oldest non-cooldown shortcut regardless of pin state
            if (oldestId == null) {
                for (ShortcutInfo info : currentDynamic) {
                    long created = prefs != null ? prefs.getLong(info.getId(), 0) : 0;
                    if (now - created < CREATION_COOLDOWN_MS) continue;
                    if (created < oldestTime) {
                        oldestId = info.getId();
                        oldestTime = created;
                    }
                }
            }

            if (oldestId != null) {
                manager.removeDynamicShortcuts(Collections.singletonList(oldestId));
                android.util.Log.d("ShortcutPlugin", "Evicted dynamic shortcut (timestamp-based): " + oldestId);
            } else {
                android.util.Log.w("ShortcutPlugin", "All dynamic shortcuts are in cooldown, cannot evict");
            }
        } catch (Exception e) {
            android.util.Log.w("ShortcutPlugin", "evictOldestDynamicShortcut error: " + e.getMessage());
        }
    }

    // ========== Dismissed Notification IDs ==========

    @PluginMethod
    public void getDismissedNotificationIds(PluginCall call) {
        Context context = getContext();
        String[] ids = NotificationDismissReceiver.getAndClearDismissedIds(context);
        JSObject result = new JSObject();
        result.put("success", true);
        JSArray idsArray = new JSArray();
        for (String id : ids) {
            idsArray.put(id);
        }
        result.put("ids", idsArray);
        call.resolve(result);
    }

    // ========== Battery Optimization ==========

    @PluginMethod
    public void checkBatteryOptimization(PluginCall call) {
        android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean exempted = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("exempted", exempted);
        call.resolve(result);
    }

    @PluginMethod
    public void requestBatteryOptimization(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            android.util.Log.e("ShortcutPlugin", "requestBatteryOptimization error: " + e.getMessage());
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }
}
