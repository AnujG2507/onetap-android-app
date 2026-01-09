# OneTap - Native Android Setup

This document explains how to set up and test the OneTap app on your Android device.

## Prerequisites

- **Node.js** (v18 or later)
- **Java Development Kit (JDK) 21** ⚠️ **Critical: Must be JDK 21, not 17 or lower**
- **Android Studio** (with Android SDK)
- **An Android phone** (Android 8.0+) with Developer Mode enabled
- **USB cable** to connect your phone

---

## Ubuntu/Linux System Setup

If you're on Ubuntu or another Debian-based Linux, follow these steps to set up your environment:

### Install Node.js (v18+)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install JDK 21 (Required!)

```bash
# Install OpenJDK 21
sudo apt update
sudo apt install openjdk-21-jdk -y

# Set Java 21 as default
sudo update-alternatives --config java
# Select the java-21 option

sudo update-alternatives --config javac
# Select the javac-21 option

# Set JAVA_HOME in ~/.bashrc
echo 'export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64' >> ~/.bashrc
echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Install Android Studio

1. Download from: https://developer.android.com/studio
2. Extract and run the installer
3. Complete the setup wizard (this will download the Android SDK)

### Set Android Environment Variables

Add to `~/.bashrc`:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$ANDROID_HOME/platform-tools:$PATH
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
```

Then run: `source ~/.bashrc`

### Install Required 32-bit Libraries (for Android SDK tools)

```bash
sudo apt install libc6:i386 libncurses5:i386 libstdc++6:i386 lib32z1 libbz2-1.0:i386
```

---

## Step-by-Step Testing Instructions

### Step 1: Export to GitHub

1. In Lovable, click the **GitHub** button (top right)
2. Click **"Export to GitHub"** and create a new repository
3. Wait for the export to complete

### Step 2: Clone and Setup Locally

```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME

# Install dependencies
npm install

# Add Android platform
npx cap add android

# Build the web app
npm run build

# Sync to Android
npx cap sync android
```

### Step 3: Add Native Android Code

The native Android code for shortcut functionality is already included in the repository. After running `npx cap sync`, you just need to activate it.

> **Note:** The native files are located in `android/app/src/main/java/app/onetap/shortcuts/` and are initially commented out to prevent build errors during initial setup.

---

#### 3a. Activate ShortcutPlugin

The plugin file is already in the repo at:
`android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java`

**To activate:**
1. Open the file in your editor
2. Remove the block comment markers (`/*` at the top and `*/` at the bottom)
3. Save the file

<details>
<summary>📋 Click to see the full ShortcutPlugin.java code (for reference)</summary>

##### Java Version: `ShortcutPlugin.java`

File location: `android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java`

```kotlin
package app.onetap.shortcuts.plugins

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
        
        val intent = Intent(intentAction).apply {
            data = Uri.parse(intentData)
            intentType?.let { type = it }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        
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
        
        call.getString("iconEmoji")?.let { emoji ->
            return createEmojiIcon(emoji)
        }
        
        call.getString("iconText")?.let { text ->
            return createTextIcon(text)
        }
        
        return Icon.createWithResource(context, android.R.drawable.ic_menu_add)
    }
    
    @RequiresApi(Build.VERSION_CODES.O)
    private fun createEmojiIcon(emoji: String): Icon {
        val size = 192
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        
        val bgPaint = Paint().apply {
            color = Color.parseColor("#2563EB")
            style = Paint.Style.FILL
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint)
        
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
        
        val bgPaint = Paint().apply {
            color = Color.parseColor("#2563EB")
            style = Paint.Style.FILL
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint)
        
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

</details>

---

#### 3b. Activate MainActivity

The MainActivity file is already in the repo at:
`android/app/src/main/java/app/onetap/shortcuts/MainActivity.java`

**To activate:**
1. Open the file in your editor
2. Remove the block comment markers (`/*` at the top and `*/` at the bottom)
3. **Delete** the existing `MainActivity.kt` file that Capacitor generated (if present)
4. Save the file

<details>
<summary>📋 Click to see the full MainActivity.java code (for reference)</summary>

```java
package app.onetap.shortcuts;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import app.onetap.shortcuts.plugins.ShortcutPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the ShortcutPlugin BEFORE calling super.onCreate()
        registerPlugin(ShortcutPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

</details>

---

#### 3c. Replace AndroidManifest.xml

The complete AndroidManifest.xml is already in the repo at:
`android/app/src/main/AndroidManifest.xml`

**To activate:**
1. Back up your existing AndroidManifest.xml (optional)
2. The file from git is ready to use - just remove the instruction comments at the top
3. Save the file

<details>
<summary>📋 Click to see the full AndroidManifest.xml (for reference)</summary>

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- ========== PERMISSIONS (inside <manifest>, before <application>) ========== -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="com.android.launcher.permission.INSTALL_SHORTCUT" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <!-- ========== MAIN ACTIVITY ========== -->
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">
            
            <!-- MAIN/LAUNCHER intent-filter (app icon launcher) -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- ========== SHARE SHEET INTENT FILTERS (inside <activity>) ========== -->
            <!-- Handle shared text (URLs, etc.) -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/*" />
            </intent-filter>
            
            <!-- Handle shared images -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
            
            <!-- Handle shared videos -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="video/*" />
            </intent-filter>

        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>

    </application>

</manifest>
```

</details>

**⚠️ CRITICAL for Android 12+:**
- The `<activity>` tag MUST have `android:exported="true"` 
- All `<intent-filter>` blocks for Share Sheet MUST be INSIDE the `<activity>` tag, NOT directly inside `<manifest>`
- This is required for the app to appear in the Share Sheet

---

### Quick Setup Summary

After `git pull`, here's the quick checklist:

```bash
# 1. Uncomment ShortcutPlugin.java
# Open: android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java
# Remove /* at top and */ at bottom

# 2. Uncomment MainActivity.java  
# Open: android/app/src/main/java/app/onetap/shortcuts/MainActivity.java
# Remove /* at top and */ at bottom
# Delete MainActivity.kt if it exists

# 3. AndroidManifest.xml is ready to use
# Just remove the instruction comments at the very top

# 4. Rebuild and run
npm run build
npx cap sync android
npx cap run android
```

---

### Step 4: Enable Developer Mode on Your Phone

1. Go to **Settings → About Phone**
2. Tap **Build Number** 7 times
3. Go back to **Settings → Developer Options**
4. Enable **USB Debugging**

### Step 5: Connect and Run

```bash
# Connect your phone via USB
# Accept the "Allow USB debugging" prompt on your phone

# Run the app
npx cap run android
```

This will build and install the app directly on your phone!

### Alternative: Use Android Studio

```bash
# Open in Android Studio
npx cap open android
```

Then click the **Run** button (green play icon) in Android Studio.

---

## Verification Checklist

Before building, verify your environment is correctly configured:

```bash
# Check Java version (should be 21.x)
java -version

# Check Java compiler version (should be 21.x)  
javac -version

# Check JAVA_HOME points to JDK 21
echo $JAVA_HOME

# Check ANDROID_HOME is set
echo $ANDROID_HOME

# Check device is connected (after plugging in phone)
adb devices
```

Expected output:
```
java version: openjdk 21.x.x
javac version: javac 21.x.x
JAVA_HOME: /usr/lib/jvm/java-21-openjdk-amd64
ANDROID_HOME: /home/youruser/Android/Sdk
adb devices: List of devices attached
             XXXXXXXX    device
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Device not detected | Check USB cable, enable USB debugging, run `adb devices` |
| Build fails with Java error | Install JDK 21 and set as default (see System Setup section) |
| "Cannot find a Java installation matching: {languageVersion=21}" | Your Java version is too old. Install JDK 21 |
| Build fails | Run `npx cap sync android` again |
| App crashes | Check Logcat in Android Studio for errors |
| Shortcuts not working | Ensure Android 8.0+ and launcher supports pinned shortcuts |
| VM/USB passthrough issues | In VirtualBox: Devices → USB → select your phone. In VMware: VM → Removable Devices → select phone |
| `adb: permission denied` | Run: `sudo usermod -aG plugdev $USER` then restart |

### Clean Rebuild (Nuclear Option)

If you're having persistent build issues:

```bash
# Remove android folder and start fresh
rm -rf android
npx cap add android
npm run build
npx cap sync android

# After this, git pull again to get the native code files
git pull

# Activate native code (Step 3) - uncomment the Java files
# Then run
npx cap run android
```

---

## Building a Release APK

1. Open in Android Studio: `npx cap open android`
2. Go to **Build → Generate Signed Bundle/APK**
3. Select **APK**
4. Create a new keystore or use existing
5. Build the signed APK
6. Find APK in `android/app/release/`
