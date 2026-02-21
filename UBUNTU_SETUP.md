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
sudo apt remove --purge -y openjdk-17-jdk openjdk-21-jdk

# Uninstall Gradle from SDKMAN (if installed via sdk)
sdk uninstall gradle 8.5 2>/dev/null || true
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

## Part 3: Java Setup (JDK 21 Required)

Android builds require **JDK 21** for Gradle 8.13 and modern Android Gradle Plugin compatibility.

### 3.1 Install JDK 21 (required)

```bash
sudo apt update
sudo apt install -y openjdk-21-jdk

# Set as default
sudo update-alternatives --config java
sudo update-alternatives --config javac

# Set JAVA_HOME
echo 'export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64' >> ~/.bashrc
source ~/.bashrc

# Verify
java -version  # Should show 21.x
echo $JAVA_HOME
```

### 3.2 (Optional) Keep JDK 17 available

If you need JDK 17 for other projects:

```bash
sudo apt install -y openjdk-17-jdk
# Switch between versions with:
sudo update-alternatives --config java
```

**Key point:** The patch script configures the Android project to use **JDK 21** via `android/gradle.properties`.

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

## Part 5: Install Gradle via SDKMAN (for wrapper generation)

```bash
# Install SDKMAN if not already installed
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

# Install Gradle 8.5
sdk install gradle 8.5

# Verify
gradle -v   # Should show Gradle 8.5
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

## Part 7: Add Android Platform (Gradle 9/10 Compatible)

```bash
# Add Android platform (generates android/ gradle files)
npx cap add android

# Patch the generated Android project:
# - Updates Gradle wrapper to 8.13 (Gradle 9/10 ready)
# - Uses modern Gradle DSL syntax (= assignments)
# - Converts deprecated SDK version properties (minSdkVersion → minSdk)
# - Removes deprecated repositories (jcenter)
# - Sets minimum Android version to Android 12 (minSdk=31)
# - Configures JDK 21
# - Adds release signing configuration
node scripts/android/patch-android-project.mjs

# Build web assets
npm run build

# Sync to Android
npx cap sync android
```

---

## Part 8: Native Code (Automatic)

The `patch-android-project.mjs` script automatically copies all native Java files, resources, and XML configurations from `native/android/` into the generated `android/` directory. **No manual uncommenting or file editing is required.**

This happens automatically when you run:
```bash
node scripts/android/patch-android-project.mjs
```

Or as part of the clean rebuild:
```bash
node scripts/android/clean-rebuild-android.mjs --run
```

> ⚠️ **Never manually edit files in `android/`.** That directory is regenerated on every clean build. All native code changes must be made in `native/android/`.

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

# Re-apply Gradle 9/10 compatible patches (safe to run every time)
node scripts/android/patch-android-project.mjs

npx cap run android
```

Or use the automated rebuild with verification:

```bash
node scripts/android/clean-rebuild-android.mjs --verify --run
```

---

## Environment Verification Checklist

Run these commands to verify your setup:

```bash
echo "=== Node.js ===" && node -v
echo "=== npm ===" && npm -v
echo "=== Java ===" && java -version
echo "=== JAVA_HOME ===" && echo $JAVA_HOME
echo "=== Android SDK ===" && echo $ANDROID_HOME
echo "=== ADB ===" && adb devices
```

Expected output:
- Node: v18+ or v20+
- Java: 21.x (required for Gradle 8.13)
- JAVA_HOME: set to JDK 21 path
- ANDROID_HOME: set correctly
- ADB: shows connected devices

---

## Troubleshooting

### `Could not determine java version from '21.x'` / `'21.0.x'`

This happens when the generated Android project is using an older Gradle wrapper.

```bash
# Ensure Android platform exists
npx cap add android

# Apply all Gradle 9/10 compatible fixes
node scripts/android/patch-android-project.mjs

# Then try again
npx cap sync android
npx cap run android
```

### Gradle Deprecation Warnings

If you see warnings like "will be removed in Gradle 10":

```bash
# Check for deprecations
cd android && ./gradlew build --warning-mode all

# The patch script fixes these automatically
cd ..
node scripts/android/patch-android-project.mjs
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
node scripts/android/patch-android-project.mjs
npx cap run android
```

---

## Summary Flowchart

```
0. (Optional) Reset toolchain + remove android/
      ↓
1. System Update
      ↓
2. Install: Node.js, JDK 21, Android Studio
      ↓
3. Set Environment Variables (ANDROID_HOME, JAVA_HOME)
      ↓
4. Clone Repo → npm install
      ↓
5. npx cap add android
      ↓
6. node scripts/android/patch-android-project.mjs   (Gradle 9/10 compatible)
      ↓
7. npm run build → npx cap sync android
      ↓
8. Native code copied automatically by patch script (step 6)
      ↓
9. Connect Phone (USB Debugging ON)
      ↓
10. npx cap run android
```

## Gradle 9/10 Compatibility

The patch script ensures full compatibility with future Gradle versions:

| Deprecated Pattern | Modern Replacement |
|-------------------|-------------------|
| `minSdkVersion 31` | `minSdk = 31` |
| `compileSdkVersion 36` | `compileSdk = 36` |
| `signingConfig signingConfigs.release` | `signingConfig = signingConfigs.release` |
| `jcenter()` | Removed (uses `google()` + `mavenCentral()`) |
| `compile 'lib'` | `implementation 'lib'` |
| `lintOptions {}` | `lint {}` |

