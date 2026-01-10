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

> **What this plugin does:**
> - **File size handling**: Files under 5MB are copied to app storage; larger files use direct paths where possible
> - **Base64 file support**: Handles files picked from the in-app file picker (web-based)
> - **Samsung compatibility**: Uses `FLAG_GRANT_PERSISTABLE_URI_PERMISSION` and grants permissions to all handler apps
> - **MIME type detection**: Ensures the right apps appear in the chooser

---

#### 3b. Activate file_paths.xml

The FileProvider configuration is already in the repo at:
`android/app/src/main/res/xml/file_paths.xml`

**To activate:**
1. Open the file in your editor
2. Remove the instruction comment at the top
3. Uncomment the `<paths>` block by removing `<!--` and `-->`
4. Save the file

The file should look like this when activated:
```xml
<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <files-path name="shortcuts" path="shortcuts/" />
</paths>
```

> **Why is this needed?** When you create a shortcut for a local file (image, video, PDF), the app copies it to private storage. This config allows other apps to access those files via secure `content://` URIs.

---

#### 3c. Activate MainActivity

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

#### 3d. Replace AndroidManifest.xml

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

# 2. Uncomment file_paths.xml
# Open: android/app/src/main/res/xml/file_paths.xml
# Remove comment markers around the <paths> element

# 3. Uncomment MainActivity.java  
# Open: android/app/src/main/java/app/onetap/shortcuts/MainActivity.java
# Remove /* at top and */ at bottom
# Delete MainActivity.kt if it exists

# 4. AndroidManifest.xml is ready to use
# Just remove the instruction comments at the very top

# 5. Rebuild and run
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
