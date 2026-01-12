# OneTap - Android Setup Guide

## Prerequisites

- **Node.js** v18+
- **JDK 21** (not 17 or lower)
- **Android Studio** with Android SDK
- **Android phone** (8.0+) with USB debugging enabled

## Quick Start

### 1. Export & Clone

```bash
# Export from Lovable to GitHub, then:
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
npx cap add android
npm run build
npx cap sync android
```

### 2. Activate Native Code

After cloning, uncomment these files by removing `/*` and `*/` block comment markers:

```bash
# Open all files that need uncommenting:
gedit android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java
gedit android/app/src/main/java/app/onetap/shortcuts/MainActivity.java
gedit android/app/src/main/java/app/onetap/shortcuts/VideoProxyActivity.java
gedit android/app/src/main/res/xml/file_paths.xml
```

**For each Java file:** Remove `/*` at the top and `*/` at the bottom.

**For file_paths.xml:** Uncomment the `<paths>` element (remove `<!--` and `-->`).

**Also:** Delete `MainActivity.kt` if it exists:
```bash
rm -f android/app/src/main/java/app/onetap/shortcuts/MainActivity.kt
```

### 3. Run on Device

```bash
# Enable USB debugging on your phone first
npx cap run android
```

Or open in Android Studio: `npx cap open android`

## After Code Changes

```bash
git pull
npm run build
npx cap sync android
npx cap run android
```

## Environment Check

```bash
java -version      # Should be 21.x
echo $JAVA_HOME    # Should point to JDK 21
echo $ANDROID_HOME # Should be set
adb devices        # Should list your device
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Device not detected | Enable USB debugging, check cable |
| Java version error | Install JDK 21, set as default |
| Build fails | Run `npx cap sync android` |
| Shortcuts not working | Requires Android 8.0+ |
| `spawn ./gradlew ENOENT` | See Gradlew fix below |
| `Could not determine java version from '21.x'` | Update Gradle wrapper (8.4+) or use JDK 17 |


### Gradlew Not Found Fix

If you get `spawn ./gradlew ENOENT` error:

```bash
cd android
gradle wrapper
cd ..
npx cap run android
```

If `gradle` command not found, install it first:
```bash
sudo apt install gradle -y  # Ubuntu/Debian
brew install gradle         # macOS
```

### Java 21 / Gradle Compatibility Fix

If you get `Could not determine java version from '21.x'`, your Gradle wrapper is too old.

**Fix (recommended):** Update the Gradle wrapper used by the generated `android/` project:

```bash
cd android
# Pick one (8.4+ supports Java 21)
./gradlew wrapper --gradle-version 8.4.2
# or edit gradle/wrapper/gradle-wrapper.properties (distributionUrl)
cd ..
```

**If the command fails immediately:** temporarily point `JAVA_HOME` to **JDK 17**, run the wrapper update once, then switch back to JDK 21.

### Clean Rebuild


```bash
rm -rf android
npx cap add android
npm run build
npx cap sync android
git checkout -- android/  # Restore native files
# Uncomment the Java files again
npx cap run android
```

## Release APK

1. `npx cap open android`
2. Build → Generate Signed Bundle/APK → APK
3. Find APK in `android/app/release/`
