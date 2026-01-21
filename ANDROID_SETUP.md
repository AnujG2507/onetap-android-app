# OneTap - Android Setup Guide

## Prerequisites

- **Node.js** v18+
- **JDK 21** (recommended for Android/Gradle)
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

### 2. Apply Native Patches

Run the patch script to copy native Java files and configure Gradle:

```bash
node scripts/android/patch-android-project.mjs
```

This script:
- Copies custom Java files from `native/android/` to `android/`
- Updates Gradle wrapper to 8.13
- Sets minSdk=31, compileSdk=36, targetSdk=36
- Configures JDK 21

### 3. Configure OAuth (Required for Google Sign-In)

**Backend Setup:**
1. Open your Lovable project
2. Go to **Cloud → Users → Auth Settings → URL Configuration**
3. Add `onetap://auth-callback` to "Redirect URLs"

This enables the native OAuth flow where Google sign-in returns directly to the app instead of the web.

### 4. Run on Device

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
node scripts/android/patch-android-project.mjs  # If native files changed
npx cap run android
```

## Environment Check

```bash
java -version      # Should be 21.x
echo $JAVA_HOME    # Should point to JDK 21
echo $ANDROID_HOME # Should be set
adb devices        # Should list your device
```

## OAuth Deep Link Flow

The app uses a custom URL scheme for native OAuth:

1. User taps "Sign in with Google"
2. App opens Google OAuth in Chrome Custom Tab
3. After authentication, Google redirects to `onetap://auth-callback?code=...`
4. Android intercepts this URL (via intent-filter in AndroidManifest.xml)
5. App exchanges the code for a session token
6. User is signed in

**Files involved:**
- `native/android/app/src/main/AndroidManifest.xml` - Deep link intent-filter
- `src/hooks/useDeepLink.ts` - Handles `appUrlOpen` events
- `src/hooks/useAuth.ts` - Native OAuth flow with `skipBrowserRedirect`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Device not detected | Enable USB debugging, check cable |
| Java version error | Install JDK 21, set as default |
| Build fails | Run `npx cap sync android` |
| Shortcuts not working | Requires Android 8.0+ |
| `spawn ./gradlew ENOENT` | See Gradlew fix below |
| OAuth goes to lovable.dev | Add `onetap://auth-callback` to backend redirect URLs |
| "ES256 invalid signing" | Backend redirect URL not configured (see above) |

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

### Java Toolchain Error (Looking for Java 21)

If you see an error like:

- `Cannot find a Java installation ... matching: {languageVersion=21 ...}`

**Fix:** Install JDK 21 and re-run the patch script:

```bash
# Ubuntu/Debian
sudo apt install openjdk-21-jdk -y
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

# Then re-patch
node scripts/android/patch-android-project.mjs
npm run build
npx cap sync android
npx cap run android
```

### OAuth Not Returning to App

If Google sign-in completes but you end up on lovable.dev instead of the app:

1. **Check backend redirect URLs:** Ensure `onetap://auth-callback` is listed in Cloud → Users → Auth Settings → URL Configuration
2. **Verify AndroidManifest:** The intent-filter should include:
   ```xml
   <intent-filter>
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="onetap" android:host="auth-callback" />
   </intent-filter>
   ```
3. **Use Auth Debug panel:** In dev builds, tap the "Auth" button to see platform info and last received deep link

### Clean Rebuild

```bash
rm -rf android
npx cap add android
node scripts/android/patch-android-project.mjs
npm run build
npx cap sync android
npx cap run android
```

## Release APK

1. `npx cap open android`
2. Build → Generate Signed Bundle/APK → APK
3. Find APK in `android/app/release/`
