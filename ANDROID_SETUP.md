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

After cloning, uncomment these files by removing `/*` and `*/` markers:

| File | Action |
|------|--------|
| `android/.../plugins/ShortcutPlugin.java` | Remove block comments |
| `android/.../MainActivity.java` | Remove block comments, delete `MainActivity.kt` if exists |
| `android/.../VideoProxyActivity.java` | Remove block comments |
| `android/.../res/xml/file_paths.xml` | Uncomment the `<paths>` element |

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
