# ============================================================================
# OneTap Shortcuts - ProGuard Rules for Production Release
# ============================================================================
# This file configures code shrinking, obfuscation, and optimization for
# the production Android build.
# ============================================================================

# ----------------------------------------------------------------------------
# GENERAL ANDROID RULES
# ----------------------------------------------------------------------------

# Preserve line number information for debugging stack traces
-keepattributes SourceFile,LineNumberTable

# Hide original source file names in stack traces
-renamesourcefileattribute SourceFile

# Keep native method names
-keepclasseswithmembernames class * {
    native <methods>;
}

# Preserve Parcelable implementations
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}

# Keep Serializable classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ----------------------------------------------------------------------------
# CAPACITOR FRAMEWORK
# ----------------------------------------------------------------------------

# Keep all Capacitor core classes
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.annotation.** { *; }

# Keep all plugins and their methods
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# Keep plugin method annotations
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}

# Keep Bridge and WebView related classes
-keep class com.getcapacitor.BridgeWebViewClient { *; }
-keep class com.getcapacitor.BridgeFragment { *; }
-keep class com.getcapacitor.BridgeActivity { *; }

# ----------------------------------------------------------------------------
# ONETAP NATIVE ACTIVITIES & PLUGINS
# ----------------------------------------------------------------------------

# Keep all OneTap activity classes
-keep class app.onetap.access.** { *; }

# Keep the ShortcutPlugin specifically
-keep class app.onetap.access.plugins.ShortcutPlugin { *; }

# Keep all activity classes for intent handling
-keep class app.onetap.access.MainActivity { *; }
-keep class app.onetap.access.LinkProxyActivity { *; }
-keep class app.onetap.access.ContactProxyActivity { *; }
-keep class app.onetap.access.FileProxyActivity { *; }
-keep class app.onetap.access.PDFProxyActivity { *; }
-keep class app.onetap.access.VideoProxyActivity { *; }
-keep class app.onetap.access.MessageProxyActivity { *; }
-keep class app.onetap.access.WhatsAppProxyActivity { *; }
-keep class app.onetap.access.SlideshowProxyActivity { *; }
-keep class app.onetap.access.ShortcutEditProxyActivity { *; }
-keep class app.onetap.access.DesktopWebViewActivity { *; }
-keep class app.onetap.access.NativeVideoPlayerActivity { *; }

-keep class app.onetap.access.NativePdfViewerV2Activity { *; }
-keep class app.onetap.access.NotificationClickActivity { *; }

# Keep broadcast receivers
-keep class app.onetap.access.BootReceiver { *; }
-keep class app.onetap.access.ScheduledActionReceiver { *; }

# Keep widget classes
-keep class app.onetap.access.QuickCreateWidget { *; }

# Keep helper classes
-keep class app.onetap.access.NotificationHelper { *; }
-keep class app.onetap.access.NativeUsageTracker { *; }
-keep class app.onetap.access.CrashLogger { *; }

# ----------------------------------------------------------------------------
# ANDROIDX MEDIA3 / EXOPLAYER
# ----------------------------------------------------------------------------

# Keep Media3 ExoPlayer classes
-keep class androidx.media3.** { *; }
-keep interface androidx.media3.** { *; }

# Keep ExoPlayer extension classes
-keep class androidx.media3.exoplayer.** { *; }
-keep class androidx.media3.ui.** { *; }
-keep class androidx.media3.common.** { *; }

# Prevent obfuscation of media3 classes used in reflection
-keepclassmembers class androidx.media3.** {
    *;
}

# ----------------------------------------------------------------------------
# ANDROIDX SUPPORT LIBRARIES
# ----------------------------------------------------------------------------

# SwipeRefreshLayout
-keep class androidx.swiperefreshlayout.widget.** { *; }

# RecyclerView
-keep class androidx.recyclerview.widget.** { *; }

# ExifInterface
-keep class androidx.exifinterface.media.** { *; }

# AppCompat
-keep class androidx.appcompat.** { *; }
-keep interface androidx.appcompat.** { *; }

# Core KTX
-keep class androidx.core.** { *; }

# ----------------------------------------------------------------------------
# WEBKIT & WEBVIEW
# ----------------------------------------------------------------------------

# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView related classes
-keep class android.webkit.** { *; }

# ----------------------------------------------------------------------------
# JSON PROCESSING
# ----------------------------------------------------------------------------

# Keep JSON classes used for data exchange
-keep class org.json.** { *; }

# Keep any JSON-related annotations
-keepclassmembers class * {
    @org.json.* *;
}

# ----------------------------------------------------------------------------
# REFLECTION & DYNAMIC FEATURES
# ----------------------------------------------------------------------------

# Keep classes that might be accessed via reflection
-keepclassmembers class * {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

# ----------------------------------------------------------------------------
# REMOVE LOGGING IN RELEASE
# ----------------------------------------------------------------------------

# Remove Android Log statements in release builds
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# Keep warning and error logs for crash reporting
# -assumenosideeffects class android.util.Log {
#     public static int w(...);
#     public static int e(...);
# }

# ----------------------------------------------------------------------------
# OPTIMIZATION
# ----------------------------------------------------------------------------

# Enable aggressive optimizations
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*

# Allow access modification for optimization
-allowaccessmodification

# Merge interfaces when possible
-mergeinterfacesaggressively

# ----------------------------------------------------------------------------
# DEBUGGING (Comment out for production)
# ----------------------------------------------------------------------------

# Uncomment to preserve all class names for debugging
# -dontobfuscate

# Uncomment to keep all public classes
# -keep public class * { public *; }
