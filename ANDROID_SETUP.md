# QuickLaunch - Native Android Setup

This document explains how to set up the native Android code for full functionality.

## Prerequisites

1. Export this project to GitHub
2. Clone the repository locally
3. Run `npm install`
4. Run `npx cap add android`
5. Run `npm run build`
6. Run `npx cap sync`

## Native Android Files to Add

After running `npx cap sync`, you need to add the following native Android code:

### 1. ShortcutPlugin.kt

Create file: `android/app/src/main/java/app/lovable/.../plugins/ShortcutPlugin.kt`

```kotlin
package app.lovable.quicklaunch.plugins

import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ShortcutPlugin")
class ShortcutPlugin : Plugin() {

    @PluginMethod
    fun createPinnedShortcut(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(JSObject().put("success", false))
            return
        }
        
        val context = context ?: run {
            call.resolve(JSObject().put("success", false))
            return
        }
        
        val shortcutManager = context.getSystemService(ShortcutManager::class.java)
        
        if (!shortcutManager.isRequestPinShortcutSupported) {
            call.resolve(JSObject().put("success", false))
            return
        }
        
        val id = call.getString("id") ?: return
        val label = call.getString("label") ?: return
        val intentAction = call.getString("intentAction") ?: "android.intent.action.VIEW"
        val intentData = call.getString("intentData") ?: return
        val intentType = call.getString("intentType")
        
        // Create the intent that opens content directly
        val intent = Intent(intentAction).apply {
            data = Uri.parse(intentData)
            intentType?.let { type = it }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        
        // Create icon
        val icon = createIcon(call)
        
        val shortcutInfo = ShortcutInfo.Builder(context, id)
            .setShortLabel(label)
            .setLongLabel(label)
            .setIcon(icon)
            .setIntent(intent)
            .build()
        
        shortcutManager.requestPinShortcut(shortcutInfo, null)
        
        call.resolve(JSObject().put("success", true))
    }
    
    @RequiresApi(Build.VERSION_CODES.O)
    private fun createIcon(call: PluginCall): Icon {
        val context = context!!
        
        // Try emoji icon
        call.getString("iconEmoji")?.let { emoji ->
            return createEmojiIcon(emoji)
        }
        
        // Try text icon
        call.getString("iconText")?.let { text ->
            return createTextIcon(text)
        }
        
        // Default icon
        return Icon.createWithResource(context, android.R.drawable.ic_menu_add)
    }
    
    @RequiresApi(Build.VERSION_CODES.O)
    private fun createEmojiIcon(emoji: String): Icon {
        val size = 192
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        
        // Draw background
        val bgPaint = Paint().apply {
            color = Color.parseColor("#2563EB")
            style = Paint.Style.FILL
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint)
        
        // Draw emoji
        val textPaint = Paint().apply {
            textSize = size * 0.5f
            textAlign = Paint.Align.CENTER
        }
        val y = (size / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2)
        canvas.drawText(emoji, size / 2f, y, textPaint)
        
        return Icon.createWithBitmap(bitmap)
    }
    
    @RequiresApi(Build.VERSION_CODES.O)
    private fun createTextIcon(text: String): Icon {
        val size = 192
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        
        // Draw background
        val bgPaint = Paint().apply {
            color = Color.parseColor("#2563EB")
            style = Paint.Style.FILL
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint)
        
        // Draw text
        val textPaint = Paint().apply {
            color = Color.WHITE
            textSize = size * 0.4f
            textAlign = Paint.Align.CENTER
            isFakeBoldText = true
        }
        val displayText = text.take(2).uppercase()
        val y = (size / 2f) - ((textPaint.descent() + textPaint.ascent()) / 2)
        canvas.drawText(displayText, size / 2f, y, textPaint)
        
        return Icon.createWithBitmap(bitmap)
    }
    
    @PluginMethod
    fun checkShortcutSupport(call: PluginCall) {
        val result = JSObject()
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val shortcutManager = context?.getSystemService(ShortcutManager::class.java)
            result.put("supported", true)
            result.put("canPin", shortcutManager?.isRequestPinShortcutSupported ?: false)
        } else {
            result.put("supported", false)
            result.put("canPin", false)
        }
        
        call.resolve(result)
    }
    
    @PluginMethod
    fun getSharedContent(call: PluginCall) {
        val activity = activity ?: run {
            call.resolve(null)
            return
        }
        
        val intent = activity.intent
        val action = intent.action
        val type = intent.type
        
        if (Intent.ACTION_SEND == action && type != null) {
            val result = JSObject()
            result.put("action", action)
            result.put("type", type)
            
            if (type.startsWith("text/")) {
                intent.getStringExtra(Intent.EXTRA_TEXT)?.let {
                    result.put("text", it)
                }
            } else {
                (intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let {
                    result.put("data", it.toString())
                }
            }
            
            call.resolve(result)
        } else {
            call.resolve(null)
        }
    }
}
```

### 2. Register the Plugin

In `android/app/src/main/java/.../MainActivity.kt`, add:

```kotlin
import app.lovable.quicklaunch.plugins.ShortcutPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(ShortcutPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

### 3. AndroidManifest.xml Updates

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Inside <manifest> -->
<uses-permission android:name="com.android.launcher.permission.INSTALL_SHORTCUT" />

<!-- Inside <activity> for Share Sheet support -->
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/*" />
</intent-filter>
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="image/*" />
</intent-filter>
```

## Running the App

1. Connect an Android device or start an emulator
2. Run `npx cap run android`

## Building for Release

1. In Android Studio, go to Build → Generate Signed Bundle/APK
2. Create or use a keystore
3. Build a signed APK for distribution
