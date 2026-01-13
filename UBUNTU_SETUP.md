# OneTap - Complete Ubuntu VM Setup Guide

A comprehensive guide for setting up and testing the project from scratch on Ubuntu (and recovering from Gradle/Java issues).

---

## Part 0: Fresh Start / Reset (Optional, but recommended if your VM is "dirty")

If you experimented with multiple JDKs, Android Studio installs, or partially-generated `android/` folders, do this once.

### 0.1 Remove generated Android platform (safe)

```bash
# From the project root
rm -rf android
```

### 0.2 Uninstall common Android/Java tooling (optional)

Only do this if you want a truly clean machine:

```bash
sudo apt remove --purge -y openjdk-17-jdk openjdk-21-jdk gradle
sudo apt autoremove -y

# If you installed Android Studio under /opt like in this guide
sudo rm -rf /opt/android-studio
sudo rm -f /usr/share/applications/android-studio.desktop

# Remove Android SDK (will delete installed SDK platforms/build-tools)
rm -rf "$HOME/Android/Sdk"
```

Reboot the VM after a deep reset.

---

## Part 1: System Preparation

### 1.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Install Essential Tools

```bash
sudo apt install -y git curl wget unzip zip
```

---

## Part 2: Install Node.js (v18+)

```bash
# Install via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v    # Should show v20.x
npm -v     # Should show 10.x
```

---

## Part 3: Java Setup (Fixes Gradle + Java 21 Issues)

Android builds are most reliable when **Gradle runs on JDK 17**, even if your system default is JDK 21.

### 3.1 Install JDK 17 (required for Android/Gradle reliability)

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk

# Recommended: expose a dedicated env var the patch script can use
echo 'export JAVA_HOME_17=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
source ~/.bashrc

# Verify
/usr/lib/jvm/java-17-openjdk-amd64/bin/java -version
```

### 3.2 (Optional) Keep JDK 21 as your system default

If you already use JDK 21 for other projects, you can keep it installed and even set it as default:

```bash
sudo apt install -y openjdk-21-jdk
sudo update-alternatives --config java
sudo update-alternatives --config javac
java -version
```

**Key point:** the Android project will be configured to use **JDK 17** via `android/gradle.properties` (`org.gradle.java.home=...`) using the patch script below.

---

## Part 4: Install Android Studio & SDK

### 4.1 Download Android Studio

```bash
# Download (or get latest from https://developer.android.com/studio)
cd ~/Downloads
wget https://redirector.gvt1.com/edgedl/android/studio/ide-zips/2024.2.1.11/android-studio-2024.2.1.11-linux.tar.gz

# Extract
sudo tar -xzf android-studio-*.tar.gz -C /opt/

# Create launcher
echo '[Desktop Entry]
Name=Android Studio
Exec=/opt/android-studio/bin/studio.sh
Icon=/opt/android-studio/bin/studio.png
Type=Application
Categories=Development;IDE;' | sudo tee /usr/share/applications/android-studio.desktop
```

### 4.2 Run First-Time Setup

```bash
/opt/android-studio/bin/studio.sh
```

- Complete the setup wizard
- Install recommended SDK components
- Accept all licenses

### 4.3 Set Environment Variables

```bash
# Add to ~/.bashrc
echo '
# Android SDK
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/emulator
' >> ~/.bashrc

source ~/.bashrc

# Verify
echo $ANDROID_HOME   # Should show /home/YOUR_USER/Android/Sdk
adb --version        # Should work
```

### 4.4 Accept SDK Licenses

```bash
yes | sdkmanager --licenses
```

---

## Part 5: Install Gradle (for wrapper generation)

```bash
sudo apt install -y gradle

# Verify
gradle -v
```

---

## Part 6: Fresh Project Clone

### 6.1 Remove Old Clone (if exists)

```bash
# CAREFUL: This deletes the old folder
rm -rf ~/old-project-folder
```

### 6.2 Clone Fresh

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git onetap
cd onetap
```

### 6.3 Install Dependencies

```bash
npm install
```

---

## Part 7: Add Android Platform (and apply required Android-12 + Java/Gradle fixes)

```bash
# Add Android platform (generates android/ gradle files)
npx cap add android

# Patch the generated Android project:
# - Updates Gradle wrapper (fixes Java 21 "Could not determine java version")
# - Forces minimum Android version to Android 12 (minSdkVersion=31)
# - Pins Gradle to run on JDK 17 (org.gradle.java.home)
node scripts/android/patch-android-project.mjs

# Build web assets
npm run build

# Sync to Android
npx cap sync android
```

---

## Part 8: Activate Native Code

The native Java files are commented out by default. You must uncomment them:

### 8.1 Uncomment Java Files

Open each file and remove the `/*` at the top and `*/` at the bottom:

```bash
# Open files (use your preferred editor)
gedit android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java &
gedit android/app/src/main/java/app/onetap/shortcuts/MainActivity.java &
gedit android/app/src/main/java/app/onetap/shortcuts/VideoProxyActivity.java &
```

### 8.2 Uncomment XML File

```bash
gedit android/app/src/main/res/xml/file_paths.xml &
```

Remove `<!--` and `-->` around the `<paths>` element.

### 8.3 Delete Kotlin File (if exists)

```bash
rm -f android/app/src/main/java/app/onetap/shortcuts/MainActivity.kt
```

---

## Part 9: Connect Your Android Phone

### 9.1 Enable Developer Options on Phone

1. Go to **Settings → About Phone**
2. Tap **Build Number** 7 times
3. Go back to **Settings → Developer Options**
4. Enable **USB Debugging**

### 9.2 Connect and Verify

```bash
# Connect phone via USB
adb devices
```

You should see your device listed. If it shows "unauthorized", check your phone for a permission prompt.

---

## Part 10: Run the App

```bash
npx cap run android
```

Select your device when prompted.

---

## Quick Reference: After Code Changes

Whenever you pull new code:

```bash
git pull
npm run build
npx cap sync android

# Re-apply Android 12 + Gradle/JDK fixes (safe to run every time)
node scripts/android/patch-android-project.mjs

npx cap run android
```

---

## Environment Verification Checklist

Run these commands to verify your setup:

```bash
echo "=== Node.js ===" && node -v
echo "=== npm ===" && npm -v
echo "=== Java (system) ===" && java -version
echo "=== JAVA_HOME_17 (recommended) ===" && echo $JAVA_HOME_17
echo "=== Android SDK ===" && echo $ANDROID_HOME
echo "=== ADB ===" && adb devices
```

(Optional) If you installed Gradle system-wide:

```bash
gradle -v
```

Expected output:
- Node: v18+ or v20+
- Java (system): 17.x or 21.x
- JAVA_HOME_17: set (points to JDK 17)
- ANDROID_HOME: set correctly
- ADB: shows connected devices

---

## Troubleshooting

### `Could not determine java version from '21.x'` / `'21.0.x'`

This happens when the generated Android project is using an older Gradle wrapper.

```bash
# Ensure Android platform exists
npx cap add android

# Apply all Gradle/Java/SDK fixes
node scripts/android/patch-android-project.mjs

# Then try again
npx cap sync android
npx cap run android
```

### `spawn ./gradlew ENOENT`

```bash
cd android
gradle wrapper
cd ..
node scripts/android/patch-android-project.mjs
npx cap run android
```


### Device Not Detected

```bash
# Restart ADB
adb kill-server
adb start-server
adb devices
```

### Permission Denied on gradlew

```bash
chmod +x android/gradlew
```

### Clean Rebuild

If all else fails:

```bash
rm -rf android
npx cap add android
npm run build
npx cap sync android
# Re-uncomment native files (see Part 8)
npx cap run android
```

---

## Summary Flowchart

```
0. (Optional) Reset toolchain + remove android/
      ↓
1. System Update
      ↓
2. Install: Node.js, JDK 17 (and optionally JDK 21), Android Studio
      ↓
3. Set Environment Variables (ANDROID_HOME, JAVA_HOME_17)
      ↓
4. Clone Repo → npm install
      ↓
5. npx cap add android
      ↓
6. node scripts/android/patch-android-project.mjs   (Android 12 + Gradle/JDK fixes)
      ↓
7. npm run build → npx cap sync android
      ↓
8. Uncomment Native Code (Java files + XML)
      ↓
9. Connect Phone (USB Debugging ON)
      ↓
10. npx cap run android
```

